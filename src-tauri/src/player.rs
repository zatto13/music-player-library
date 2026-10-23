use crate::state::AppState;
use rodio::{Decoder, Sink};
use std::fs::File;
use std::io::BufReader;
use std::time::Duration;
use tauri::State;

#[tauri::command]
pub fn play_track(state: State<AppState>, file_path: String) -> Result<(), String> {
    let file = File::open(&file_path).map_err(|e| e.to_string())?;
    let source = Decoder::new(BufReader::new(file)).map_err(|e| e.to_string())?;

    let mut sink_lock = state.player.sink.lock().map_err(|e| e.to_string())?;

    let sink = Sink::try_new(&state.player.stream_handle).map_err(|e| e.to_string())?;
    let current_vol = *state.player.volume.lock().map_err(|e| e.to_string())?;
    sink.set_volume(current_vol);

    sink.append(source);
    sink.play();

    *sink_lock = Some(sink);
    Ok(())
}

#[tauri::command]
pub fn toggle_play_pause(state: State<AppState>) -> Result<bool, String> {
    let sink_lock = state.player.sink.lock().map_err(|e| e.to_string())?;
    if let Some(sink) = sink_lock.as_ref() {
        if sink.is_paused() {
            sink.play();
            Ok(true)
        } else {
            sink.pause();
            Ok(false)
        }
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub fn get_playback_position(state: State<AppState>) -> Result<f32, String> {
    let sink_lock = state.player.sink.lock().map_err(|e| e.to_string())?;
    if let Some(sink) = sink_lock.as_ref() {
        Ok(sink.get_pos().as_secs_f32())
    } else {
        Ok(0.0)
    }
}

#[tauri::command]
pub fn seek_track(state: State<AppState>, position_secs: f32) -> Result<(), String> {
    let sink_lock = state.player.sink.lock().map_err(|e| e.to_string())?;
    if let Some(sink) = sink_lock.as_ref() {
        let _ = sink.try_seek(Duration::from_secs_f32(position_secs));
    }
    Ok(())
}

#[tauri::command]
pub fn set_volume(state: State<AppState>, volume: f32) -> Result<(), String> {
    let mut vol_lock = state.player.volume.lock().map_err(|e| e.to_string())?;
    *vol_lock = volume.clamp(0.0, 1.0);

    let sink_lock = state.player.sink.lock().map_err(|e| e.to_string())?;
    if let Some(sink) = sink_lock.as_ref() {
        sink.set_volume(*vol_lock);
    }

    Ok(())
}