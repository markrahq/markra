#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if markra_lib::run_portable_update_helper_if_requested() {
        return;
    }
    markra_lib::run();
}
