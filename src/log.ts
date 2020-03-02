var log_level = 4;

export function log(text: string) {
    global.log("pop-shell: " + text);
}

export function info(text: string) {
    if (log_level > 0) log(" [INFO] " + text);
}

export function error(text: string) {
    if (log_level > 1) {
        log("[ERROR] " + text);
        global.notify_error("Pop Shell Error", text);
    };
}

export function warn(text: string) {
    if (log_level > 2) log(" [WARN] " + text);
}

export function debug(text: string) {
    if (log_level > 3) log("[DEBUG] " + text);
}
