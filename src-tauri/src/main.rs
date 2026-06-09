/*
 * @Author: fofo
 * @Date: 2026-06-08 13:32:59
 * @LastEditTime: 2026-06-09 11:50:01
 * @LastEditors: fofo
 * @Description: 
 * @FilePath: /foconn/src-tauri/src/main.rs
 */
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    foconn_lib::run()
}
