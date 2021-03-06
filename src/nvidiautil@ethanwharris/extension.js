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
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Lang = imports.lang;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Clutter = imports.gi.Clutter;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Util = Me.imports.util;
const ProcessorHandler = Me.imports.processorHandler;
const SettingsProvider = Me.imports.settingsProvider;
const SmiProvider = Me.imports.smiProvider;
const SettingsAndSmiProvider = Me.imports.settingsAndSmiProvider;
const OptimusProvider = Me.imports.optimusProvider;
const Spawn = Me.imports.spawn;

var PROVIDERS = [
  SettingsAndSmiProvider.SettingsAndSmiProvider,
  SettingsProvider.SettingsProvider,
  SmiProvider.SmiProvider,
  OptimusProvider.OptimusProvider
];

var PROVIDER_SETTINGS = [
  "settingsandsmiconfig",
  "settingsconfig",
  "smiconfig",
  "optimusconfig"
]

/*
 * Open the preferences for the nvidiautil extension
 */
function openPreferences() {
  Spawn.spawnAsync("gnome-shell-extension-prefs " + Me.metadata['uuid'], Spawn.defaultErrorHandler);
}

const PropertyMenuItem = new Lang.Class({
  Name: 'PropertyMenuItem',
  Extends: PopupMenu.PopupBaseMenuItem,
  _init: function(property, box, labelManager, settings, setting, index) {
    this.parent();

    this._destroyed = false;

    this._settings = settings;
    this._setting = setting;
    this._index = index;

    this._box = box;
    this.labelManager = labelManager;

    this.actor.add(new St.Icon({ icon_name: property.getIcon(),
                                      style_class: 'popup-menu-icon' }));

    this.label = new St.Label({ text: property.getName() });
    this.actor.add(this.label, { expand: true });
    this.actor.label_actor = this.label;

    this._icon = new St.Icon({ icon_name: property.getIcon(),
                                      style_class: 'system-status-icon' });

    this._statisticLabelHidden = new St.Label({ text: '0' });
    this._statisticLabelVisible = new St.Label({
        text: '0',
        style_class: 'label',
        y_expand: true,
        y_align: Clutter.ActorAlign.CENTER });

    this._box.add_child(this._icon);
    this._box.add_child(this._statisticLabelVisible);

    //this.reloadBox(2);

    this.actor.add(this._statisticLabelHidden);
    this._visible = false;
    this._box.visible = false;
  },
  reloadBox: function(spacing, icons) {
    if (!this._destroyed) {
      this._icon.visible = icons;

      this._statisticLabelVisible.set_style('margin-right: ' + spacing + 'px');
    }
  },
  destroy: function() {
    this._destroyed = true;

    this._box.destroy();
    this._statisticLabelHidden.destroy();

    this.parent();
    this.activate = function(event) {
      // Do Nothing
    };
    this.handle = function(value) {
      // Do Nothing
    };
    this.setActive = function(active) {
      // Do Nothing
    }
  },
  activate: function(event) {
    if (this._visible) {
      this.actor.remove_style_pseudo_class('active');
      this._visible = false;
      this._box.visible = false;
      this.labelManager.decrement();

      let flags = this._settings.get_strv(this._setting);
      flags[this._index] = "inactive";
      this._settings.set_strv(this._setting, flags);
    } else {
      this.actor.add_style_pseudo_class('active');
      this._visible = true;
      this._box.visible = true;
      this.labelManager.increment();

      let flags = this._settings.get_strv(this._setting);
      flags[this._index] = "active";
      this._settings.set_strv(this._setting, flags);
    }
  },
  setActive: function(active) {
    this.parent(active);
    if (this._visible) {
      this.actor.add_style_pseudo_class('active');
    }
  },
  handle: function(value) {
    this._statisticLabelHidden.text = value;
    this._statisticLabelVisible.text = value;
    if (value == 'ERR') {
      if (this._visible) {
        this.activate("");
      }

      this.destroy();
    }
  }
});

const PersistentPopupMenu = new Lang.Class({
  Name: 'PersistentPopupMenu',
  Extends: PopupMenu.PopupMenu,
  _init: function(actor, menuAlignment) {
    this.parent(actor, menuAlignment, St.Side.TOP, 0);
  },
  _setOpenedSubMenu: function(submenu) {
    this._openedSubMenu = submenu;
  }
});

const GpuLabelDisplayManager = new Lang.Class({
  Name: 'GpuLabelDisplayManager',
  _init: function(gpuLabel) {
    this.gpuLabel = gpuLabel;
    this.count = 0;
    this.gpuLabel.visible = false;
  },
  increment: function() {
    this.count = this.count + 1;

    if (this.gpuLabel.visible == false) {
      this.gpuLabel.visible = true;
    }
  },
  decrement: function() {
    this.count = this.count - 1;

    if (this.count == 0 && this.gpuLabel.visible == true) {
      this.gpuLabel.visible = false;
    }
  }
});

const EmptyDisplayManager = new Lang.Class({
  Name: 'EmptyDisplayManager',
  increment: function() {
    // Do Nothing
  },
  decrement: function() {
    // Do Nothing
  }
});

const MainMenu = new Lang.Class({
  Name: 'MainMenu',
  Extends: PanelMenu.Button,
  _init: function(settings) {
    this.parent(0.0, _("GPU Statistics"));
    this.timeoutId = -1;
    this._settings = settings;
    this._error = false;

    this.processor = new ProcessorHandler.ProcessorHandler();

    this.setMenu(new PersistentPopupMenu(this.actor, 0.0));

    let hbox = new St.BoxLayout({ style_class: 'panel-status-menu-box' });

    this.properties = new St.BoxLayout({style_class: 'panel-status-menu-box'});

    hbox.add_actor(this.properties);
    hbox.add_actor(PopupMenu.arrowIcon(St.Side.BOTTOM));
    this.actor.add_child(hbox);

    this._reload();
    this._updatePollTime();

    this._settingChangedSignals = [];
    this._addSettingChangedSignal(Util.SETTINGS_PROVIDER, Lang.bind(this, this._reload));
    this._addSettingChangedSignal(Util.SETTINGS_REFRESH, Lang.bind(this, this._updatePollTime));
    this._addSettingChangedSignal(Util.SETTINGS_TEMP_UNIT, Lang.bind(this, this._updateTempUnits));
    this._addSettingChangedSignal(Util.SETTINGS_POSITION, Lang.bind(this, this._updatePanelPosition));
    this._addSettingChangedSignal(Util.SETTINGS_SPACING, Lang.bind(this, this._updateSpacing));
    this._addSettingChangedSignal(Util.SETTINGS_ICONS, Lang.bind(this, this._updateSpacing));
  },
  _reload: function() {
    this.menu.removeAll();

    this._propertiesMenu = new PopupMenu.PopupMenuSection();
    this.menu.addMenuItem(this._propertiesMenu);

    this.properties.destroy_all_children();

    this.processor.reset();

    let p = this._settings.get_int(Util.SETTINGS_PROVIDER);
    this.provider = new PROVIDERS[p]();

    let flags = this._settings.get_strv(PROVIDER_SETTINGS[p]);

    this.names = this.provider.getGpuNames();

    if (this.names != Spawn.ERROR) {

      let listeners = [];

      this.providerProperties = this.provider.getProperties(this.names.length - 1);

      for (let i = 0; i < this.providerProperties.length; i++) {
        listeners[i] = [];
      }

      for (let n = 0; n < this.names.length - 1; n++) {
        let submenu = new PopupMenu.PopupSubMenuMenuItem(this.names[n]);

        let manager;

        if (this.names.length - 1 > 1) {
          let style = 'gpulabel';
          if (n == 0) {
            style = 'gpulabelleft';
          }
          let label = new St.Label({ text : n + ':', style_class : style});
          manager = new GpuLabelDisplayManager(label);
          this.properties.add_child(label);
        } else {
          manager = new EmptyDisplayManager();
        }

        this._propertiesMenu.addMenuItem(submenu);

        for (let i = 0; i < this.providerProperties.length; i++) {
          let box = new St.BoxLayout({ style_class: 'panel-status-menu-box' });

          let index = (n * this.providerProperties.length) + i;
          let item = new PropertyMenuItem(this.providerProperties[i], box, manager, this._settings, PROVIDER_SETTINGS[p], index);

          if (this.providerProperties[i].getName() == "Temperature") {
            let unit = this._settings.get_int(Util.SETTINGS_TEMP_UNIT)
            this.providerProperties[i].setUnit(unit)
          }

          listeners[i][n] = item;
          submenu.menu.addMenuItem(item);
          this.properties.add_child(box);
        }
      }

      for (let i = 0; i < this.providerProperties.length; i++) {
        this.processor.addProperty(this.providerProperties[i], listeners[i]);
      }

      this.processor.process();

      for (let n = 0; n < this.names.length - 1; n++) {
        for (let i = 0; i < this.providerProperties.length; i++) {
          let index = (n * this.providerProperties.length) + i;

          if (!flags[index]) {
            flags[index] = "inactive";
          }

          if (flags[index] == "active") {
            listeners[i][n].activate();
          }
        }
      }

      this._items = listeners;

      this._updateSpacing();

      this._settings.set_strv(PROVIDER_SETTINGS[p], flags);
    } else {
      this._error = true;
    }

    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    let item = new PopupMenu.PopupBaseMenuItem({ reactive: false,
                                         can_focus: false });

    this.wrench = new St.Button({
      reactive: true,
      can_focus: true,
      track_hover: true,
      accessible_name: 'Open Preferences',
      style_class: 'system-menu-action'
    });
    this.wrench.child = new St.Icon({ icon_name: 'wrench-symbolic' });
    this.wrench.connect('clicked', () => { openPreferences(); });
    item.actor.add(this.wrench, { expand: true, x_fill: false });

    if (this.provider.hasSettings()) {
      this.cog = new St.Button({
        reactive: true,
        can_focus: true,
        track_hover: true,
        accessible_name: 'Open Nvidia Settings',
        style_class: 'system-menu-action'
      });
      this.cog.child = new St.Icon({ icon_name: 'cog-symbolic' });
      this.cog.connect('clicked', Lang.bind(this.provider, this.provider.openSettings));
      item.actor.add(this.cog, { expand: true, x_fill: false });
    }

    this.menu.addMenuItem(item);
  },
  _updatePollTime: function() {
    if (!this._error) {
      this._addTimeout(this._settings.get_int(Util.SETTINGS_REFRESH));
    }
  },
  _updateTempUnits: function() {
    let unit = 0;

    for (let i = 0; i < this.providerProperties.length; i++) {
      if (this.providerProperties[i].getName() == "Temperature") {

        unit = this._settings.get_int(Util.SETTINGS_TEMP_UNIT)
        this.providerProperties[i].setUnit(unit)
      }
    }
    this.processor.process();
  },
  _updatePanelPosition: function() {
    this.container.get_parent().remove_actor(this.container);

    let boxes = {
      left: Main.panel._leftBox,
      center: Main.panel._centerBox,
      right: Main.panel._rightBox
    };

    let pos = this.getPanelPosition();
    boxes[pos].insert_child_at_index(this.container, pos == 'right' ? 0 : -1)
  },
  getPanelPosition : function() {
    let positions = ["left", "center", "right"];
    return positions[_settings.get_int(Util.SETTINGS_POSITION)];
  },
  _updateSpacing : function() {
    let spacing = _settings.get_int(Util.SETTINGS_SPACING);
    let icons = _settings.get_boolean(Util.SETTINGS_ICONS);

    for (let n = 0; n < this.names.length - 1; n++) {
      for (let i = 0; i < this.providerProperties.length; i++) {
        this._items[i][n].reloadBox(spacing, icons);
      }
    }
  },
  /*
   * Create and add the timeout which updates values every t seconds
   */
  _addTimeout: function(t) {
    this._removeTimeout();

    this.timeoutId = GLib.timeout_add_seconds(0, t, Lang.bind(this, function() {
      this.processor.process();
      return true;
    }));
  },
  /*
   * Remove current timeout
   */
  _removeTimeout: function() {
    if (this.timeoutId != -1) {
      GLib.source_remove(this.timeoutId);
      this.timeoutId = -1;
    }
  },
  _addSettingChangedSignal: function(key, callback) {
    this._settingChangedSignals.push(this._settings.connect('changed::' + key, callback));
  },
  destroy: function() {
    this._removeTimeout();

    for (let signal of this._settingChangedSignals) {
      this._settings.disconnect(signal);
    };

    this.parent();
  }
});

let _menu;
let _settings;

/*
 * Init function, nothing major here, do not edit view
 */
function init() {
  Gtk.IconTheme.get_default().append_search_path(Me.dir.get_child('icons').get_path());
  _settings = Util.getSettings();
}

function enable() {
    _menu = new MainMenu(_settings);

    let pos = _menu.getPanelPosition();
    Main.panel.addToStatusArea('main-menu', _menu, pos == 'right' ? 0 : -1, pos);
}

function disable() {
    _menu.destroy();
}
