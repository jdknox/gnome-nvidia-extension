/*This file is part of Nvidia Util Gnome Extension.

Nvidia Util Gnome Extension is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Nvidia Util Gnome Extension is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with Nvidia Util Gnome Extension.  If not, see <http://www.gnu.org/licenses/>.*/

const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Me = imports.misc.extensionUtils.getCurrentExtension();

var button;
var timeout_id;
var logo_util;
var logo_temp;
var logo_ram;
var util_label;
var temp_label;
var mem_label;

var use_nvidia_settings = false;

/*
 * Init function, nothing major here, do not edit view
 */
function init() {
  Gtk.IconTheme.get_default().append_search_path(Me.dir.get_child('icons').get_path());
}

/*
 * Enable handles the main functioning of the extension, editing view and updating
 */
function enable() {
  logo_util = new St.Icon({icon_name: 'nvidia-card-symbolic', style_class: 'system-status-icon'});
  logo_temp = new St.Icon({icon_name: 'nvidia-temp-symbolic', style_class: 'system-status-icon'});
  logo_ram = new St.Icon({icon_name: 'nvidia-ram-symbolic', style_class: 'system-status-icon'});

  util_label = new St.Label({text: "%", style_class: 'label'});
  temp_label = new St.Label({text: "\xB0" + "C", style_class: 'label'});
  mem_label = new St.Label ({text: "%", style_class: 'label'});

  var settings = GLib.find_program_in_path("nvidia-settings");
  var smi = GLib.find_program_in_path("nvidia-smi");

  if (settings) {
    button = new St.Bin({
      style_class: 'panel-button',
      reactive: true,
      can_focus: true,
      x_fill: true,
      y_fill: false,
      track_hover: true
    });
    button.connect('button-press-event', open_settings);
  } else {
    button = new St.Bin({
      style_class: 'panel-button',
      reactive: false,
      can_focus: false,
      x_fill: true,
      y_fill: false,
      track_hover: false
    });
  }

  if (settings && !smi) {
    use_nvidia_settings = true;
  } else if (smi && !settings) {
    use_nvidia_settings = false;
  } else if (!settings && !smi) {
    button.set_child(new St.Label({text: "Error - nvidia-settings or -smi not present!"}))
    Main.panel._rightBox.insert_child_at_index(button, 0);
    return;
  }

  var info = get_info();
  var box = build_button_box(info);

  button.set_child(box);

  timeout_id = GLib.timeout_add_seconds(0, 2, Lang.bind(this, function () {
    var info = get_info();
    update_button_box(info);
    return true;
  }));

  Main.panel._rightBox.insert_child_at_index(button, 0);
}

/*
 * Disable should remove elements from viewwhich where added and de-assign any timeouts etc.
 */
function disable() {
  Main.panel._rightBox.remove_child(button);
  GLib.source_remove(timeout_id);
}

/*
 * Open the Nvidia Settings tool
 * Note: This will not check if nvidia-settings exists first
 */
function open_settings() {
  GLib.spawn_command_line_async("nvidia-settings");
}

/*
 * Root function to get info depending on which options are available
 */
function get_info() {
  if (!use_nvidia_settings) {
    return get_info_smi();
  } else {
    return get_info_settings();
  }
}

/*
 * Get info using nvidia-smi. This uses one call to smi and an efficient
 * state machine to parse. Use this if possible.
 */
function get_info_smi() {
  var smi = GLib.spawn_command_line_sync("nvidia-smi")[1].toString().split('\n');

  var values_line = smi[8];
  var buffer_state = false;

  buffer = [];
  values = [];
  var buffer_index = 0;
  var values_index = 0;

  for (var i = 0; i < values_line.length; i++) {
    var c = values_line.charAt(i);

    if (c >= '0' && c <= '9') {
      buffer_state = true;
      buffer[buffer_index] = c;
      buffer_index = buffer_index + 1;
    } else if (buffer_state == true) {
      buffer_index = 0;
      values[values_index] = buffer.join("");
      buffer = [];
      values_index += 1;
      buffer_state = false;
    }
  }

  if (values.length < 8) {
    var settings = GLib.find_program_in_path("nvidia-settings");
    if (!settings) {
      return ["N/A", "N/A", "N/A"];
    } else {
      use_nvidia_settings = true;
      return get_info_settings();
    }
  } else {
    var temp = values[1];
    var used_memory = values[5];
    var total_memory = values[6];
    var util = values[7];

    var mem_usage = (used_memory / total_memory * 100).toString();
    mem_usage = mem_usage.substring(0,2);

    return [util, temp, mem_usage];
  }
}

/*
 * Get info using nvidia-settings. Multiple calls to nvidia-settings required.
 * Use only if there are no available alternatives.
 */
function get_info_settings() {
  var util = GLib.spawn_command_line_sync("nvidia-settings -q GPUUtilization -t")[1].toString();
  util = util.substring(9,11);
  util = util.replace(/\D/g,'');

  var temp = GLib.spawn_command_line_sync("nvidia-settings -q GPUCoreTemp -t")[1].toString();
  temp = temp.split('\n')[0];

  var used_memory = GLib.spawn_command_line_sync("nvidia-settings -q UsedDedicatedGPUMemory -t")[1];
  var total_memory = GLib.spawn_command_line_sync("nvidia-settings -q TotalDedicatedGPUMemory -t")[1];
  var mem_usage = (used_memory / total_memory * 100).toString();
  mem_usage = mem_usage.substring(0,2);

  return [util, temp, mem_usage];
}

/*
 * Construct the button box (the box layout which stores the info)
 */
function build_button_box(info) {
  var box = new St.BoxLayout({name: 'DataBox'});

  update_button_box(info);

  box.add_actor(logo_util);
  box.add_actor(util_label);
  box.add_actor(logo_temp);
  box.add_actor(temp_label);
  box.add_actor(logo_ram);
  box.add_actor(mem_label);

  return box;
}

/*
 * Update the info labels
 */
function update_button_box(info) {
  util_label.text = info[0] + "%";
  temp_label.text = info[1] + "\xB0" + "C";
  mem_label.text = info[2] + "%";
}
