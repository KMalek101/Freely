use std::io::{self, Read, Write};
use std::os::unix::io::AsRawFd;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

fn main() -> io::Result<()> {
    let dev = std::env::args().nth(1).unwrap_or_else(|| {
        eprintln!("Usage: audio-capture-helper <device-name>");
        eprintln!("Run `pactl list sources short` to list available devices.");
        std::process::exit(1);
    });

    let running = Arc::new(AtomicBool::new(true));
    let cmd = "parec";
    let args = [
        format!("--device={dev}"),
        "--format=s16le".into(),
        "--rate=16000".into(),
        "--channels=1".into(),
        "--raw".into(),
    ];

    eprintln!("spawning: {cmd} {}", args.join(" "));

    let mut child = Command::new(cmd)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| {
            if e.kind() == io::ErrorKind::NotFound {
                io::Error::new(
                    io::ErrorKind::NotFound,
                    "parec not found — install pulseaudio-utils",
                )
            } else {
                e
            }
        })?;

    let mut parec_out = child.stdout.take().unwrap();

    setup_signal_handler(Arc::clone(&running));

    // Write JSON header, then raw PCM
    let header = b"{\"sample_rate\":16000,\"channels\":1,\"sample_format\":\"S16LE\"}\n";
    io::stdout().write_all(header)?;
    io::stdout().flush()?;

    let mut buf = [0u8; 8192];

    while running.load(Ordering::Relaxed) {
        let n = match read_with_timeout(&mut parec_out, &mut buf, Duration::from_millis(100))? {
            Some(n) if n == 0 => break,
            Some(n) => n,
            None => continue,
        };

        io::stdout().write_all(&buf[..n])?;
        io::stdout().flush()?;
    }

    let _ = child.kill();
    child.wait()?;
    Ok(())
}

fn read_with_timeout(
    reader: &mut (impl Read + AsRawFd),
    buf: &mut [u8],
    timeout: Duration,
) -> io::Result<Option<usize>> {
    let fd = reader.as_raw_fd();

    loop {
        let mut fds = [libc::pollfd {
            fd,
            events: libc::POLLIN,
            revents: 0,
        }];

        let ret = unsafe { libc::poll(fds.as_mut_ptr(), 1, timeout.as_millis() as i32) };
        if ret < 0 {
            let err = io::Error::last_os_error();
            if err.kind() == io::ErrorKind::Interrupted {
                continue;
            }
            return Err(err);
        }
        if ret == 0 {
            return Ok(None);
        }

        match reader.read(buf) {
            Ok(0) => return Ok(Some(0)),
            Ok(n) => return Ok(Some(n)),
            Err(e) if e.kind() == io::ErrorKind::WouldBlock => continue,
            Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e),
        }
    }
}

fn setup_signal_handler(running: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        let mut signals = signal_hook::iterator::Signals::new(&[
            signal_hook::consts::SIGTERM,
            signal_hook::consts::SIGINT,
        ])
        .expect("failed to register signal handler");
        for _ in signals.forever() {
            running.store(false, Ordering::Relaxed);
            break;
        }
    });
}
