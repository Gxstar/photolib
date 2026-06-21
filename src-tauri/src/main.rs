// PhotoLib - 轻量级专业照片管理工具
// Rust 后端入口

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    photolib_lib::run()
}
