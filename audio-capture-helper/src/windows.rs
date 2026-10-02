use std::collections::VecDeque;
use std::io::{self, Write};

use wasapi::{
    initialize_mta, Device, DeviceEnumerator, Direction, SampleType, StreamMode, WaveFormat,
};

use crate::{write_pcm_header, AudioDevice, CHANNELS, SAMPLE_RATE};

// ~128 ms of 16 kHz mono audio per write, which keeps the pipe cheap without
// adding latency the VAD would notice.
const CHUNK_BYTES: usize = 4096;

// Shared-mode events arrive every ~10 ms while the endpoint is running, so
// going this long without one means it has stopped.
const IDLE_TIMEOUT_MS: u32 = 200;
const IDLE_BYTES: usize = SAMPLE_RATE * CHANNELS * 2 * IDLE_TIMEOUT_MS as usize / 1000;

fn wasapi_err(context: &str, e: impl std::fmt::Display) -> io::Error {
    io::Error::other(format!("{context}: {e}"))
}

fn com_init() -> io::Result<()> {
    let hr = initialize_mta();
    if hr.is_err() {
        return Err(io::Error::other(format!("CoInitializeEx failed: {hr:?}")));
    }
    Ok(())
}

// Playback endpoints are captured in loopback mode, which is what you want for
// "transcribe the other side of the call". The suffix keeps a headset's speaker
// and microphone apart in the picker, and `capture` matches on this same
// string, so there is nothing to parse back out.
fn display_name(device: &Device) -> io::Result<String> {
    let name = device
        .get_friendlyname()
        .map_err(|e| wasapi_err("could not read device name", e))?;
    Ok(match device.get_direction() {
        Direction::Render => format!("{name} (loopback)"),
        Direction::Capture => name,
    })
}

fn for_each_device(
    mut f: impl FnMut(Device) -> io::Result<bool>,
) -> io::Result<()> {
    com_init()?;
    let enumerator =
        DeviceEnumerator::new().map_err(|e| wasapi_err("could not open device enumerator", e))?;

    for direction in [Direction::Render, Direction::Capture] {
        // The collection only contains devices in the active state.
        let collection = enumerator
            .get_device_collection(&direction)
            .map_err(|e| wasapi_err("could not enumerate devices", e))?;

        for device in &collection {
            let device = device.map_err(|e| wasapi_err("could not open device", e))?;
            if !f(device)? {
                return Ok(());
            }
        }
    }
    Ok(())
}

pub fn list_devices() -> io::Result<Vec<AudioDevice>> {
    let mut devices = Vec::new();
    for_each_device(|device| {
        devices.push(AudioDevice {
            name: display_name(&device)?,
            state: "Active".to_string(),
        });
        Ok(true)
    })?;
    Ok(devices)
}

fn find_device(requested: &str) -> io::Result<Device> {
    let mut found = None;
    for_each_device(|device| {
        if display_name(&device)? == requested {
            found = Some(device);
            return Ok(false);
        }
        Ok(true)
    })?;

    found.ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            format!("no audio device named {requested:?} — run `audio-capture-helper --list-devices`"),
        )
    })
}

pub fn capture(requested: &str) -> io::Result<()> {
    let device = find_device(requested)?;
    let mut client = device
        .get_iaudioclient()
        .map_err(|e| wasapi_err("could not open audio client", e))?;

    let format = WaveFormat::new(16, 16, &SampleType::Int, SAMPLE_RATE, CHANNELS, None);
    let (default_period, _min_period) = client
        .get_device_period()
        .map_err(|e| wasapi_err("could not read device period", e))?;

    // `autoconvert` puts the audio engine's resampler in front of us, so the
    // device's own 48 kHz stereo float mix arrives as the 16 kHz mono PCM
    // whisper wants and the helper still only copies bytes. Asking for the
    // Capture direction on a playback device is what turns on loopback.
    let mode = StreamMode::EventsShared {
        autoconvert: true,
        buffer_duration_hns: default_period,
    };
    client
        .initialize_client(&format, &Direction::Capture, &mode)
        .map_err(|e| wasapi_err("could not initialize capture", e))?;

    let event = client
        .set_get_eventhandle()
        .map_err(|e| wasapi_err("could not get event handle", e))?;
    let capture_client = client
        .get_audiocaptureclient()
        .map_err(|e| wasapi_err("could not open capture client", e))?;

    eprintln!("capturing from: {requested}");

    client
        .start_stream()
        .map_err(|e| wasapi_err("could not start capture", e))?;

    write_pcm_header()?;

    let stdout = io::stdout();
    let mut out = stdout.lock();
    // The daemon going away closes our stdout. That is a normal exit.
    let mut send = |bytes: &[u8]| out.write_all(bytes).and_then(|()| out.flush()).is_ok();
    let mut queue: VecDeque<u8> = VecDeque::with_capacity(CHUNK_BYTES * 8);

    'capture: loop {
        // One wake-up can have several packets waiting and each read takes
        // exactly one, so drain them all or the backlog gets dropped. A device
        // that went away shows up here as an error and ends the run.
        while capture_client
            .get_next_packet_size()
            .map_err(|e| wasapi_err("capture read failed", e))?
            .is_some_and(|frames| frames > 0)
        {
            capture_client
                .read_from_device_to_deque(&mut queue)
                .map_err(|e| wasapi_err("capture read failed", e))?;
        }

        while queue.len() >= CHUNK_BYTES {
            let chunk: Vec<u8> = queue.drain(..CHUNK_BYTES).collect();
            if !send(&chunk) {
                break 'capture;
            }
        }

        if event.wait_for_event(IDLE_TIMEOUT_MS).is_err() {
            // A loopback endpoint delivers nothing at all while nothing is
            // playing, where a PulseAudio monitor would keep sending silence.
            // The VAD closes a segment by counting silent frames, so stand in
            // for the missing audio or the last sentence never gets flushed.
            let mut tail: Vec<u8> = queue.drain(..).collect();
            tail.resize(tail.len() + IDLE_BYTES, 0);
            if !send(&tail) {
                break 'capture;
            }
        }
    }

    let _ = client.stop_stream();
    Ok(())
}
