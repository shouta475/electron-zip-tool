use serde::Serialize;
use encoding_rs::SHIFT_JIS;

#[derive(Serialize)]
struct ZipEntry {
    path: String,
    is_file: bool,
    is_encrypted: bool,
}

#[repr(C)] // C互換のメモリレイアウトにすることでJS側で読めるようにする
pub struct JsonResult {
    ptr: *mut u8,
    len: usize,
}

#[no_mangle]
pub extern "C" fn list_zip_entries(ptr: *const u8, len: usize) ->  *mut JsonResult {
    let zip_data = unsafe { std::slice::from_raw_parts(ptr, len) };
    let mut entries = vec![];

    let mut i = 0;
    while i + 30 < len {
        if &zip_data[i..i + 4] == b"\x50\x4B\x03\x04" {
            // 汎用ビットフラグを取得
            let flag = u16::from_le_bytes([zip_data[i + 6], zip_data[i + 7]]);
            let file_name_len = u16::from_le_bytes([zip_data[i + 26], zip_data[i + 27]]) as usize;
            let extra_len = u16::from_le_bytes([zip_data[i + 28], zip_data[i + 29]]) as usize;

            let name_start = i + 30;
            let name_end = name_start + file_name_len;
            if name_end > len {
                break;
            }
            let name_bytes = &zip_data[name_start..name_end];
            // flag & 0x0800 != 0 → UTF-8でエンコードされている
            let name_str = if (flag & 0x0800) != 0 {
                // UTF-8
                std::str::from_utf8(name_bytes)
                    .unwrap_or("[invalid utf8]")
                    .to_string()
            } else {
                // Shift_JISに変換
                SHIFT_JIS.decode(name_bytes).0.to_string()
            };
            entries.push(ZipEntry {
                path: name_str.clone(),
                is_file: !name_str.ends_with('/'),
                is_encrypted: (flag & 0x0001) != 0,
            });
            i = name_end + extra_len;
        } else {
            i += 1;
        }
    }
    let json = serde_json::to_string(&entries).unwrap();
    let json_len = json.len();
    let mut boxed = json.into_bytes().into_boxed_slice();
    let json_ptr = boxed.as_mut_ptr();
    std::mem::forget(boxed);
    let json_result = JsonResult {
        ptr: json_ptr,
        len: json_len,
    };
    Box::into_raw(Box::new(json_result))
}

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buffer = Vec::with_capacity(len);
    let ptr = buffer.as_mut_ptr();
    std::mem::forget(buffer); // 所有権を渡す
    ptr
}

#[no_mangle]
pub extern "C" fn free(ptr: *mut u8, len: usize) {
    unsafe {
        drop(Vec::from_raw_parts(ptr, len, len));
    }
}

#[no_mangle]
pub extern "C" fn free_json_result(ptr: *mut JsonResult) {
    unsafe {
        drop(Box::from_raw(ptr));
    }
}