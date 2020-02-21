var log_level = 4;

function log(text) {
    global.log("pop-shell: " + text);
}

function info(text) {
    if (log_level > 0) log(" [INFO] " + text);
}

function error(text) {
    if (log_level > 1) log("[ERROR] " + text);
}

function warn(text) {
    if (log_level > 2) log(" [WARN] " + text);
}

function debug(text) {
    if (log_level > 3) log("[DEBUG] " + text);
}
