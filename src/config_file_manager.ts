const { Gio, GLib } = imports.gi;

export const CONF_DIR: string = GLib.get_user_config_dir() + "/pop-shell/";

export interface Ok<T> {
  tag: 0;
  value: T;
}

export interface Error {
  tag: 1;
  why: string;
}

type Result<T> = Ok<T> | Error;

export class ConfigFileManager {
  static gio_file(config_file_name: string): Result<any> {
    try {
      const path = CONF_DIR + config_file_name;
      const conf = Gio.File.new_for_path(path);

      if (!conf.query_exists(null)) {
        const dir = Gio.File.new_for_path(CONF_DIR);
        if (!dir.query_exists(null) && !dir.make_directory(null)) {
          return { tag: 1, why: "failed to create pop-shell config directory" };
        }

        conf
          .create(Gio.FileCreateFlags.NONE, null)
          .write_all(JSON.stringify([], undefined, 2), null);
      }

      return { tag: 0, value: conf };
    } catch (why) {
      return { tag: 1, why: `Gio.File I/O error: ${why}` };
    }
  }

  static read_type<T>(config_file_name: string): Result<T> {
    const contents = ConfigFileManager.read(config_file_name);
    if (contents.tag === 1) return contents;
    try {
      return { tag: 0, value: JSON.parse(contents.value) };
    } catch {
      return { tag: 1, why: "file not valid JSON." };
    }
  }

  static read(config_file_name: string): Result<string> {
    try {
      const file = ConfigFileManager.gio_file(config_file_name);
      if (file.tag === 1) return file;

      const [, buffer] = file.value.load_contents(null);

      return { tag: 0, value: imports.byteArray.toString(buffer) };
    } catch (why) {
      return { tag: 1, why: `failed to read pop-shell config: ${why}` };
    }
  }

  static write_type<T>(config_file_name: string, data: T): Result<null> {
    return ConfigFileManager.write(config_file_name, JSON.stringify(data));
  }

  static write(config_file_name: string, data: string): Result<null> {
    try {
      const file = ConfigFileManager.gio_file(config_file_name);
      if (file.tag === 1) return file;

      file.value.replace_contents(
        data,
        null,
        false,
        Gio.FileCreateFlags.NONE,
        null
      );

      return { tag: 0, value: file.value };
    } catch (why) {
      return { tag: 1, why: `failed to write to config: ${why}` };
    }
  }
}
