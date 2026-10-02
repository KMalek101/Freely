use std::io::{self, Write};

#[cfg(unix)]
#[path = "unix.rs"]
mod backend;

#[cfg(windows)]
#[path = "windows.rs"]
mod backend;

// Whisper wants 16 kHz mono PCM, so the helper always emits that and lets the
// platform audio stack do the conversion.
pub const SAMPLE_RATE: usize = 16000;
pub const CHANNELS: usize = 1;

/// One selectable input, as printed by `--list-devices`. `name` is the exact
/// string that has to be passed back in to capture from it.
pub struct AudioDevice {
    pub name: String,
    pub state: String,
}

fn main() -> io::Result<()> {
    let arg = std::env::args().nth(1).unwrap_or_else(|| {
        eprintln!("Usage: audio-capture-helper <device-name>");
        eprintln!("       audio-capture-helper --list-devices");
        std::process::exit(1);
    });

    if arg == "--list-devices" {
        println!("{}", to_json(&backend::list_devices()?));
        return Ok(());
    }

    backend::capture(&arg)
}

/// Written once on stdout, before the raw PCM stream starts.
pub fn write_pcm_header() -> io::Result<()> {
    let mut stdout = io::stdout();
    writeln!(
        stdout,
        "{{\"sample_rate\":{SAMPLE_RATE},\"channels\":{CHANNELS},\"sample_format\":\"S16LE\"}}"
    )?;
    stdout.flush()
}

// Two string fields are not worth a serde dependency.
fn to_json(devices: &[AudioDevice]) -> String {
    let items: Vec<String> = devices
        .iter()
        .map(|d| {
            format!(
                "{{\"name\":\"{}\",\"state\":\"{}\"}}",
                escape(&d.name),
                escape(&d.state)
            )
        })
        .collect();
    format!("[{}]", items.join(","))
}

// Device names are plain text, so quotes and backslashes are the only things
// that can break the output.
fn escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_json_matches_what_the_cli_parses() {
        let devices = vec![
            AudioDevice {
                name: "Speakers (Realtek(R) Audio) (loopback)".to_string(),
                state: "Active".to_string(),
            },
            AudioDevice {
                name: "Microphone \"Pro\"".to_string(),
                state: "Active".to_string(),
            },
        ];
        assert_eq!(
            to_json(&devices),
            r#"[{"name":"Speakers (Realtek(R) Audio) (loopback)","state":"Active"},{"name":"Microphone \"Pro\"","state":"Active"}]"#
        );
    }

    #[test]
    fn empty_device_list_is_still_valid_json() {
        assert_eq!(to_json(&[]), "[]");
    }
}
