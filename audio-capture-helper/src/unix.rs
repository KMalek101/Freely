use std::io::{self, Read, Write};
use std::os::unix::io::AsRawFd;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use crate::{write_pcm_header, AudioDevice, CHANNELS, SAMPLE_RATE};

fn missing_tool(tool: &'static str) -> impl Fn(io::Error) -> io::Error {
    move |e| {
        if e.kind() == io::ErrorKind::NotFound {
            io::Error::new(
                io::ErrorKind::NotFound,
                format!("{tool} not found — install pulseaudio-utils"),
            )
        } else {
            e
        }
    }
}

pub fn list_devices() -> io::Result<Vec<AudioDevice>> {
    let output = Command::new("pactl")
        .args(["list", "sources", "short"])
        .output()
        .map_err(missing_tool("pactl"))?;

    if !output.status.success() {
        return Err(io::Error::other("pactl list sources short failed"));
    }

    // index \t name \t driver \t sample spec \t state
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let mut fields = line.split('\t').skip(1);
            let name = fields.next()?;
            let state = fields.nth(2).unwrap_or("");
            Some(AudioDevice {
                name: name.to_string(),
                state: state.to_string(),
            })
        })
        .collect())
}

pub fn capture(dev: &str) -> io::Result<()> {
    let running = Arc::new(AtomicBool::new(true));
    let cmd = "parec";
    let args = [
        format!("--device={dev}"),
        "--format=s16le".into(),
        format!("--rate={SAMPLE_RATE}"),
        format!("--channels={CHANNELS}"),
        "--raw".into(),
    ];

    eprintln!("spawning: {cmd} {}", args.join(" "));

    let mut child = Command::new(cmd)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(missing_tool("parec"))?;

    let mut parec_out = child.stdout.take().unwrap();

    setup_signal_handler(Arc::clone(&running));

    write_pcm_header()?;

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
