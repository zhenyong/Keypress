
/*
Copyright 2014 David Mauro

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

Keypress is a robust keyboard input capturing Javascript utility
focused on input for games.

version 2.1.3
 */


/*
Combo options available and their defaults:
    keys                  : []            - An array of the keys pressed together to activate combo.
    count                 : 0             - The number of times a counting combo has been pressed. Reset on release.
    is_unordered          : false         - Unless this is set to true, the keys can be pressed down in any order.
    is_counting           : false         - Makes this a counting combo (see documentation).
    is_exclusive          : false         - This combo will replace other exclusive combos when true.
    is_solitary           : false         - This combo will only fire if ONLY it's keys are pressed down.
    is_sequence           : false         - Rather than a key combo, this is an ordered key sequence.
    prevent_default       : false         - Prevent default behavior for all component key keypresses.
    prevent_repeat        : false         - Prevent the combo from repeating when keydown is held.
    normalize_caps_lock   : false         - Do not allow turning caps lock on to prevent combos from being activated.
    on_keydown            : null          - A function that is called when the combo is pressed.
    on_keyup              : null          - A function that is called when the combo is released.
    on_release            : null          - A function that is called when all keys in the combo are released.
    this                  : undefined     - Defines the scope for your callback functions.
 */

(function() {
  var Combo, _change_keycodes_by_browser, _compare_arrays, _compare_arrays_sorted, _convert_key_to_readable, _convert_to_shifted_key, _decide_meta_key, _factory_defaults, _filter_array, _index_of_in_array, _is_array_in_array, _is_array_in_array_sorted, _key_is_valid, _keycode_alternate_names, _keycode_dictionary, _keycode_shifted_keys, _log_error, _metakey, _modifier_event_mapping, _modifier_keys, _validate_combo, keypress,
    hasProp = {}.hasOwnProperty,
    indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  _factory_defaults = {
    is_unordered: false,
    is_counting: false,
    is_exclusive: false,
    is_solitary: false,
    prevent_default: false,
    prevent_repeat: false,
    normalize_caps_lock: false
  };

  _modifier_keys = ["meta", "alt", "option", "ctrl", "shift", "cmd"];

  _metakey = "ctrl";

  keypress = {};

  keypress.debug = false;

  Combo = (function() {
    function Combo(dictionary) {
      var property, value;
      for (property in dictionary) {
        if (!hasProp.call(dictionary, property)) continue;
        value = dictionary[property];
        if (value !== false) {
          this[property] = value;
        }
      }
      this.keys = this.keys || [];
      this.count = this.count || 0;
    }

    Combo.prototype.allows_key_repeat = function() {
      return !this.prevent_repeat && typeof this.on_keydown === "function";
    };

    Combo.prototype.reset = function() {
      this.count = 0;
      return this.keyup_fired = null;
    };

    return Combo;

  })();

  keypress.Listener = (function() {
    function Listener(element, defaults) {
      var attach_handler, property, value;
      if ((typeof jQuery !== "undefined" && jQuery !== null) && element instanceof jQuery) {
        if (element.length !== 1) {
          _log_error("Warning: your jQuery selector should have exactly one object.");
        }
        element = element[0];
      }
      this.should_suppress_event_defaults = false;
      this.should_force_event_defaults = false;
      this.sequence_delay = 800;
      this._registered_combos = [];
      this._keys_down = [];
      this._active_combos = [];
      this._sequence = [];
      this._sequence_timer = null;
      this._prevent_capture = false;
      this._defaults = defaults || {};
      for (property in _factory_defaults) {
        if (!hasProp.call(_factory_defaults, property)) continue;
        value = _factory_defaults[property];
        this._defaults[property] = this._defaults[property] || value;
      }
      this.element = element || document.body;
      attach_handler = function(target, event, handler) {
        if (target.addEventListener) {
          target.addEventListener(event, handler);
        } else if (target.attachEvent) {
          target.attachEvent("on" + event, handler);
        }
        return handler;
      };
      this.keydown_event = attach_handler(this.element, "keydown", (function(_this) {
        return function(e) {
          e = e || window.event;
          _this._receive_input(e, true);
          return _this._bug_catcher(e);
        };
      })(this));
      this.keyup_event = attach_handler(this.element, "keyup", (function(_this) {
        return function(e) {
          e = e || window.event;
          return _this._receive_input(e, false);
        };
      })(this));
      this.blur_event = attach_handler(window, "blur", (function(_this) {
        return function() {
          var key, l, len, ref;
          ref = _this._keys_down;
          for (l = 0, len = ref.length; l < len; l++) {
            key = ref[l];
            _this._key_up(key, {});
          }
          return _this._keys_down = [];
        };
      })(this));
    }

    Listener.prototype.destroy = function() {
      var remove_handler;
      remove_handler = function(target, event, handler) {
        if (target.removeEventListener != null) {
          return target.removeEventListener(event, handler);
        } else if (target.removeEvent != null) {
          return target.removeEvent("on" + event, handler);
        }
      };
      remove_handler(this.element, "keydown", this.keydown_event);
      remove_handler(this.element, "keyup", this.keyup_event);
      return remove_handler(window, "blur", this.blur_event);
    };

    Listener.prototype._bug_catcher = function(e) {
      var ref, ref1;
      if (_metakey === "cmd" && indexOf.call(this._keys_down, "cmd") >= 0 && ((ref = _convert_key_to_readable((ref1 = e.keyCode) != null ? ref1 : e.key)) !== "cmd" && ref !== "shift" && ref !== "alt" && ref !== "caps" && ref !== "tab")) {
        return this._receive_input(e, false);
      }
    };

    Listener.prototype._cmd_bug_check = function(combo_keys) {
      if (_metakey === "cmd" && indexOf.call(this._keys_down, "cmd") >= 0 && indexOf.call(combo_keys, "cmd") < 0) {
        return false;
      }
      return true;
    };

    Listener.prototype._prevent_default = function(e, should_prevent) {
      if ((should_prevent || this.should_suppress_event_defaults) && !this.should_force_event_defaults) {
        if (e.preventDefault) {
          e.preventDefault();
        } else {
          e.returnValue = false;
        }
        if (e.stopPropagation) {
          return e.stopPropagation();
        }
      }
    };

    Listener.prototype._get_active_combos = function(key) {
      var active_combos, keys_down;
      active_combos = [];
      keys_down = _filter_array(this._keys_down, function(down_key) {
        return down_key !== key;
      });
      keys_down.push(key);
      this._match_combo_arrays(keys_down, (function(_this) {
        return function(match) {
          if (_this._cmd_bug_check(match.keys)) {
            return active_combos.push(match);
          }
        };
      })(this));
      this._fuzzy_match_combo_arrays(keys_down, (function(_this) {
        return function(match) {
          if (indexOf.call(active_combos, match) >= 0) {
            return;
          }
          if (!(match.is_solitary || !_this._cmd_bug_check(match.keys))) {
            return active_combos.push(match);
          }
        };
      })(this));
      return active_combos;
    };

    Listener.prototype._get_potential_combos = function(key) {
      var combo, l, len, potentials, ref;
      potentials = [];
      ref = this._registered_combos;
      for (l = 0, len = ref.length; l < len; l++) {
        combo = ref[l];
        if (combo.is_sequence) {
          continue;
        }
        if (indexOf.call(combo.keys, key) >= 0 && this._cmd_bug_check(combo.keys)) {
          potentials.push(combo);
        }
      }
      return potentials;
    };

    Listener.prototype._add_to_active_combos = function(combo) {
      var active_combo, active_key, active_keys, already_replaced, combo_key, i, l, len, len1, m, n, ref, ref1, should_prepend, should_replace;
      should_replace = false;
      should_prepend = true;
      already_replaced = false;
      if (indexOf.call(this._active_combos, combo) >= 0) {
        return true;
      } else if (this._active_combos.length) {
        for (i = l = 0, ref = this._active_combos.length; 0 <= ref ? l < ref : l > ref; i = 0 <= ref ? ++l : --l) {
          active_combo = this._active_combos[i];
          if (!(active_combo && active_combo.is_exclusive && combo.is_exclusive)) {
            continue;
          }
          active_keys = active_combo.keys;
          if (!should_replace) {
            for (m = 0, len = active_keys.length; m < len; m++) {
              active_key = active_keys[m];
              should_replace = true;
              if (indexOf.call(combo.keys, active_key) < 0) {
                should_replace = false;
                break;
              }
            }
          }
          if (should_prepend && !should_replace) {
            ref1 = combo.keys;
            for (n = 0, len1 = ref1.length; n < len1; n++) {
              combo_key = ref1[n];
              should_prepend = false;
              if (indexOf.call(active_keys, combo_key) < 0) {
                should_prepend = true;
                break;
              }
            }
          }
          if (should_replace) {
            if (already_replaced) {
              active_combo = this._active_combos.splice(i, 1)[0];
              if (active_combo != null) {
                active_combo.reset();
              }
            } else {
              active_combo = this._active_combos.splice(i, 1, combo)[0];
              if (active_combo != null) {
                active_combo.reset();
              }
              already_replaced = true;
            }
            should_prepend = false;
          }
        }
      }
      if (should_prepend) {
        this._active_combos.unshift(combo);
      }
      return should_replace || should_prepend;
    };

    Listener.prototype._remove_from_active_combos = function(combo) {
      var active_combo, i, l, ref;
      for (i = l = 0, ref = this._active_combos.length; 0 <= ref ? l < ref : l > ref; i = 0 <= ref ? ++l : --l) {
        active_combo = this._active_combos[i];
        if (active_combo === combo) {
          combo = this._active_combos.splice(i, 1)[0];
          combo.reset();
          break;
        }
      }
    };

    Listener.prototype._get_possible_sequences = function() {
      var combo, i, j, l, len, m, match, matches, n, ref, ref1, ref2, sequence;
      matches = [];
      ref = this._registered_combos;
      for (l = 0, len = ref.length; l < len; l++) {
        combo = ref[l];
        for (j = m = 1, ref1 = this._sequence.length; 1 <= ref1 ? m <= ref1 : m >= ref1; j = 1 <= ref1 ? ++m : --m) {
          sequence = this._sequence.slice(-j);
          if (!combo.is_sequence) {
            continue;
          }
          if (indexOf.call(combo.keys, "shift") < 0) {
            sequence = _filter_array(sequence, function(key) {
              return key !== "shift";
            });
            if (!sequence.length) {
              continue;
            }
          }
          for (i = n = 0, ref2 = sequence.length; 0 <= ref2 ? n < ref2 : n > ref2; i = 0 <= ref2 ? ++n : --n) {
            if (combo.keys[i] === sequence[i]) {
              match = true;
            } else {
              match = false;
              break;
            }
          }
          if (match) {
            matches.push(combo);
          }
        }
      }
      return matches;
    };

    Listener.prototype._add_key_to_sequence = function(key, e) {
      var combo, l, len, sequence_combos;
      this._sequence.push(key);
      sequence_combos = this._get_possible_sequences();
      if (sequence_combos.length) {
        for (l = 0, len = sequence_combos.length; l < len; l++) {
          combo = sequence_combos[l];
          this._prevent_default(e, combo.prevent_default);
        }
        if (this._sequence_timer) {
          clearTimeout(this._sequence_timer);
        }
        if (this.sequence_delay > -1) {
          this._sequence_timer = setTimeout((function(_this) {
            return function() {
              return _this._sequence = [];
            };
          })(this), this.sequence_delay);
        }
      } else {
        this._sequence = [];
      }
    };

    Listener.prototype._get_sequence = function(key) {
      var combo, i, j, l, len, m, match, n, ref, ref1, ref2, seq_key, sequence;
      ref = this._registered_combos;
      for (l = 0, len = ref.length; l < len; l++) {
        combo = ref[l];
        if (!combo.is_sequence) {
          continue;
        }
        for (j = m = 1, ref1 = this._sequence.length; 1 <= ref1 ? m <= ref1 : m >= ref1; j = 1 <= ref1 ? ++m : --m) {
          sequence = (_filter_array(this._sequence, function(seq_key) {
            if (indexOf.call(combo.keys, "shift") >= 0) {
              return true;
            }
            return seq_key !== "shift";
          })).slice(-j);
          if (combo.keys.length !== sequence.length) {
            continue;
          }
          for (i = n = 0, ref2 = sequence.length; 0 <= ref2 ? n < ref2 : n > ref2; i = 0 <= ref2 ? ++n : --n) {
            seq_key = sequence[i];
            if (indexOf.call(combo.keys, "shift") < 0) {
              if (seq_key === "shift") {
                continue;
              }
            }
            if (key === "shift" && indexOf.call(combo.keys, "shift") < 0) {
              continue;
            }
            if (combo.keys[i] === seq_key) {
              match = true;
            } else {
              match = false;
              break;
            }
          }
        }
        if (match) {
          if (combo.is_exclusive) {
            this._sequence = [];
          }
          return combo;
        }
      }
      return false;
    };

    Listener.prototype._receive_input = function(e, is_keydown) {
      var key, ref;
      if (this._prevent_capture) {
        if (this._keys_down.length) {
          this._keys_down = [];
        }
        return;
      }
      key = _convert_key_to_readable((ref = e.keyCode) != null ? ref : e.key);
      if (!is_keydown && !this._keys_down.length && (key === "alt" || key === _metakey)) {
        return;
      }
      if (!key) {
        return;
      }
      if (is_keydown) {
        return this._key_down(key, e);
      } else {
        return this._key_up(key, e);
      }
    };

    Listener.prototype._fire = function(event, combo, key_event, is_autorepeat) {
      if (typeof combo["on_" + event] === "function") {
        this._prevent_default(key_event, combo["on_" + event].call(combo["this"], key_event, combo.count, is_autorepeat) !== true);
      }
      if (event === "release") {
        combo.count = 0;
      }
      if (event === "keyup") {
        return combo.keyup_fired = true;
      }
    };

    Listener.prototype._match_combo_arrays = function(potential_match, match_handler) {
      var combo_potential_match, l, len, ref, source_combo;
      ref = this._registered_combos;
      for (l = 0, len = ref.length; l < len; l++) {
        source_combo = ref[l];
        combo_potential_match = potential_match.slice(0);
        if (source_combo.normalize_caps_lock && indexOf.call(combo_potential_match, "caps") >= 0) {
          combo_potential_match.splice(combo_potential_match.indexOf("caps"), 1);
        }
        if ((!source_combo.is_unordered && _compare_arrays_sorted(combo_potential_match, source_combo.keys)) || (source_combo.is_unordered && _compare_arrays(combo_potential_match, source_combo.keys))) {
          match_handler(source_combo);
        }
      }
    };

    Listener.prototype._fuzzy_match_combo_arrays = function(potential_match, match_handler) {
      var l, len, ref, source_combo;
      ref = this._registered_combos;
      for (l = 0, len = ref.length; l < len; l++) {
        source_combo = ref[l];
        if ((!source_combo.is_unordered && _is_array_in_array_sorted(source_combo.keys, potential_match)) || (source_combo.is_unordered && _is_array_in_array(source_combo.keys, potential_match))) {
          match_handler(source_combo);
        }
      }
    };

    Listener.prototype._keys_remain = function(combo) {
      var key, keys_remain, l, len, ref;
      ref = combo.keys;
      for (l = 0, len = ref.length; l < len; l++) {
        key = ref[l];
        if (indexOf.call(this._keys_down, key) >= 0) {
          keys_remain = true;
          break;
        }
      }
      return keys_remain;
    };

    Listener.prototype._key_down = function(key, e) {
      var combo, combos, event_mod, i, l, len, len1, m, mod, n, potential, potential_combos, ref, sequence_combo, shifted_key;
      shifted_key = _convert_to_shifted_key(key, e);
      if (shifted_key) {
        key = shifted_key;
      }
      this._add_key_to_sequence(key, e);
      sequence_combo = this._get_sequence(key);
      if (sequence_combo) {
        this._fire("keydown", sequence_combo, e);
      }
      for (mod in _modifier_event_mapping) {
        event_mod = _modifier_event_mapping[mod];
        if (!e[event_mod]) {
          continue;
        }
        if (mod === key || indexOf.call(this._keys_down, mod) >= 0) {
          continue;
        }
        this._keys_down.push(mod);
      }
      for (mod in _modifier_event_mapping) {
        event_mod = _modifier_event_mapping[mod];
        if (mod === key) {
          continue;
        }
        if (indexOf.call(this._keys_down, mod) >= 0 && !e[event_mod]) {
          if (mod === "cmd" && _metakey !== "cmd") {
            continue;
          }
          for (i = l = 0, ref = this._keys_down.length; 0 <= ref ? l < ref : l > ref; i = 0 <= ref ? ++l : --l) {
            if (this._keys_down[i] === mod) {
              this._keys_down.splice(i, 1);
            }
          }
        }
      }
      combos = this._get_active_combos(key);
      potential_combos = this._get_potential_combos(key);
      for (m = 0, len = combos.length; m < len; m++) {
        combo = combos[m];
        this._handle_combo_down(combo, potential_combos, key, e);
      }
      if (potential_combos.length) {
        for (n = 0, len1 = potential_combos.length; n < len1; n++) {
          potential = potential_combos[n];
          this._prevent_default(e, potential.prevent_default);
        }
      }
      if (indexOf.call(this._keys_down, key) < 0) {
        this._keys_down.push(key);
      }
    };

    Listener.prototype._handle_combo_down = function(combo, potential_combos, key, e) {
      var is_autorepeat, is_other_exclusive, l, len, potential_combo, result;
      if (indexOf.call(combo.keys, key) < 0) {
        return false;
      }
      this._prevent_default(e, combo && combo.prevent_default);
      is_autorepeat = false;
      if (indexOf.call(this._keys_down, key) >= 0) {
        is_autorepeat = true;
        if (!combo.allows_key_repeat()) {
          return false;
        }
      }
      result = this._add_to_active_combos(combo, key);
      combo.keyup_fired = false;
      is_other_exclusive = false;
      if (combo.is_exclusive) {
        for (l = 0, len = potential_combos.length; l < len; l++) {
          potential_combo = potential_combos[l];
          if (potential_combo.is_exclusive && potential_combo.keys.length > combo.keys.length) {
            is_other_exclusive = true;
            break;
          }
        }
      }
      if (!is_other_exclusive) {
        if (combo.is_counting && typeof combo.on_keydown === "function") {
          combo.count += 1;
        }
        if (result) {
          return this._fire("keydown", combo, e, is_autorepeat);
        }
      }
    };

    Listener.prototype._key_up = function(key, e) {
      var active_combo, active_combos_length, combo, combos, i, l, len, len1, len2, m, n, o, ref, ref1, ref2, ref3, sequence_combo, shifted_key, unshifted_key;
      unshifted_key = key;
      shifted_key = _convert_to_shifted_key(key, e);
      if (shifted_key) {
        key = shifted_key;
      }
      shifted_key = _keycode_shifted_keys[unshifted_key];
      if (e.shiftKey) {
        if (!(shifted_key && indexOf.call(this._keys_down, shifted_key) >= 0)) {
          key = unshifted_key;
        }
      } else {
        if (!(unshifted_key && indexOf.call(this._keys_down, unshifted_key) >= 0)) {
          key = shifted_key;
        }
      }
      sequence_combo = this._get_sequence(key);
      if (sequence_combo) {
        this._fire("keyup", sequence_combo, e);
      }
      if (indexOf.call(this._keys_down, key) < 0) {
        return false;
      }
      for (i = l = 0, ref = this._keys_down.length; 0 <= ref ? l < ref : l > ref; i = 0 <= ref ? ++l : --l) {
        if ((ref1 = this._keys_down[i]) === key || ref1 === shifted_key || ref1 === unshifted_key) {
          this._keys_down.splice(i, 1);
          break;
        }
      }
      active_combos_length = this._active_combos.length;
      combos = [];
      ref2 = this._active_combos;
      for (m = 0, len = ref2.length; m < len; m++) {
        active_combo = ref2[m];
        if (indexOf.call(active_combo.keys, key) >= 0) {
          combos.push(active_combo);
        }
      }
      for (n = 0, len1 = combos.length; n < len1; n++) {
        combo = combos[n];
        this._handle_combo_up(combo, e, key);
      }
      if (active_combos_length > 1) {
        ref3 = this._active_combos;
        for (o = 0, len2 = ref3.length; o < len2; o++) {
          active_combo = ref3[o];
          if (active_combo === void 0 || indexOf.call(combos, active_combo) >= 0) {
            continue;
          }
          if (!this._keys_remain(active_combo)) {
            this._remove_from_active_combos(active_combo);
          }
        }
      }
    };

    Listener.prototype._handle_combo_up = function(combo, e, key) {
      var keys_down, keys_remaining;
      this._prevent_default(e, combo && combo.prevent_default);
      keys_remaining = this._keys_remain(combo);
      if (!combo.keyup_fired) {
        keys_down = this._keys_down.slice();
        keys_down.push(key);
        if (!combo.is_solitary || _compare_arrays(keys_down, combo.keys)) {
          this._fire("keyup", combo, e);
          if (combo.is_counting && typeof combo.on_keyup === "function" && typeof combo.on_keydown !== "function") {
            combo.count += 1;
          }
        }
      }
      if (!keys_remaining) {
        this._fire("release", combo, e);
        this._remove_from_active_combos(combo);
      }
    };

    Listener.prototype.simple_combo = function(keys, callback) {
      return this.register_combo({
        keys: keys,
        on_keydown: callback
      });
    };

    Listener.prototype.counting_combo = function(keys, count_callback) {
      return this.register_combo({
        keys: keys,
        is_counting: true,
        is_unordered: false,
        on_keydown: count_callback
      });
    };

    Listener.prototype.sequence_combo = function(keys, callback) {
      return this.register_combo({
        keys: keys,
        on_keydown: callback,
        is_sequence: true,
        is_exclusive: true
      });
    };

    Listener.prototype.register_combo = function(combo_dictionary) {
      var combo, property, ref, value;
      if (typeof combo_dictionary["keys"] === "string") {
        combo_dictionary["keys"] = combo_dictionary["keys"].split(" ");
      }
      ref = this._defaults;
      for (property in ref) {
        if (!hasProp.call(ref, property)) continue;
        value = ref[property];
        if (combo_dictionary[property] === void 0) {
          combo_dictionary[property] = value;
        }
      }
      combo = new Combo(combo_dictionary);
      if (_validate_combo(combo)) {
        this._registered_combos.push(combo);
        return combo;
      }
    };

    Listener.prototype.register_many = function(combo_array) {
      var combo, l, len, results;
      results = [];
      for (l = 0, len = combo_array.length; l < len; l++) {
        combo = combo_array[l];
        results.push(this.register_combo(combo));
      }
      return results;
    };

    Listener.prototype.unregister_combo = function(keys_or_combo) {
      var combo, l, len, ref, results, unregister_combo;
      if (!keys_or_combo) {
        return false;
      }
      unregister_combo = (function(_this) {
        return function(combo) {
          var i, l, ref, results;
          results = [];
          for (i = l = 0, ref = _this._registered_combos.length; 0 <= ref ? l < ref : l > ref; i = 0 <= ref ? ++l : --l) {
            if (combo === _this._registered_combos[i]) {
              _this._registered_combos.splice(i, 1);
              break;
            } else {
              results.push(void 0);
            }
          }
          return results;
        };
      })(this);
      if (keys_or_combo instanceof Combo) {
        return unregister_combo(keys_or_combo);
      } else {
        if (typeof keys_or_combo === "string") {
          keys_or_combo = keys_or_combo.split(" ");
        }
        ref = this._registered_combos;
        results = [];
        for (l = 0, len = ref.length; l < len; l++) {
          combo = ref[l];
          if (combo == null) {
            continue;
          }
          if ((combo.is_unordered && _compare_arrays(keys_or_combo, combo.keys)) || (!combo.is_unordered && _compare_arrays_sorted(keys_or_combo, combo.keys))) {
            results.push(unregister_combo(combo));
          } else {
            results.push(void 0);
          }
        }
        return results;
      }
    };

    Listener.prototype.unregister_many = function(combo_array) {
      var combo, l, len, results;
      results = [];
      for (l = 0, len = combo_array.length; l < len; l++) {
        combo = combo_array[l];
        results.push(this.unregister_combo(combo));
      }
      return results;
    };

    Listener.prototype.get_registered_combos = function() {
      return this._registered_combos;
    };

    Listener.prototype.reset = function() {
      return this._registered_combos = [];
    };

    Listener.prototype.listen = function() {
      return this._prevent_capture = false;
    };

    Listener.prototype.stop_listening = function() {
      return this._prevent_capture = true;
    };

    Listener.prototype.get_meta_key = function() {
      return _metakey;
    };

    return Listener;

  })();

  _decide_meta_key = function() {
    if (navigator.userAgent.indexOf("Mac OS X") !== -1) {
      _metakey = "cmd";
    }
  };

  _change_keycodes_by_browser = function() {
    if (navigator.userAgent.indexOf("Opera") !== -1) {
      _keycode_dictionary["17"] = "cmd";
    }
  };

  _convert_key_to_readable = function(k) {
    return _keycode_dictionary[k];
  };

  _filter_array = function(array, callback) {
    var element;
    if (array.filter) {
      return array.filter(callback);
    } else {
      return (function() {
        var l, len, results;
        results = [];
        for (l = 0, len = array.length; l < len; l++) {
          element = array[l];
          if (callback(element)) {
            results.push(element);
          }
        }
        return results;
      })();
    }
  };

  _compare_arrays = function(a1, a2) {
    var item, l, len;
    if (a1.length !== a2.length) {
      return false;
    }
    for (l = 0, len = a1.length; l < len; l++) {
      item = a1[l];
      if (indexOf.call(a2, item) >= 0) {
        continue;
      }
      return false;
    }
    return true;
  };

  _compare_arrays_sorted = function(a1, a2) {
    var i, l, ref;
    if (a1.length !== a2.length) {
      return false;
    }
    for (i = l = 0, ref = a1.length; 0 <= ref ? l < ref : l > ref; i = 0 <= ref ? ++l : --l) {
      if (a1[i] !== a2[i]) {
        return false;
      }
    }
    return true;
  };

  _is_array_in_array = function(a1, a2) {
    var item, l, len;
    for (l = 0, len = a1.length; l < len; l++) {
      item = a1[l];
      if (indexOf.call(a2, item) < 0) {
        return false;
      }
    }
    return true;
  };

  _index_of_in_array = Array.prototype.indexOf || function(a, item) {
    var i, l, ref;
    for (i = l = 0, ref = a.length; 0 <= ref ? l <= ref : l >= ref; i = 0 <= ref ? ++l : --l) {
      if (a[i] === item) {
        return i;
      }
    }
    return -1;
  };

  _is_array_in_array_sorted = function(a1, a2) {
    var index, item, l, len, prev;
    prev = 0;
    for (l = 0, len = a1.length; l < len; l++) {
      item = a1[l];
      index = _index_of_in_array.call(a2, item);
      if (index >= prev) {
        prev = index;
      } else {
        return false;
      }
    }
    return true;
  };

  _log_error = function() {
    if (keypress.debug) {
      return console.log.apply(console, arguments);
    }
  };

  _key_is_valid = function(key) {
    var _, valid, valid_key;
    valid = false;
    for (_ in _keycode_dictionary) {
      valid_key = _keycode_dictionary[_];
      if (key === valid_key) {
        valid = true;
        break;
      }
    }
    if (!valid) {
      for (_ in _keycode_shifted_keys) {
        valid_key = _keycode_shifted_keys[_];
        if (key === valid_key) {
          valid = true;
          break;
        }
      }
    }
    return valid;
  };

  _validate_combo = function(combo) {
    var alt_name, i, key, l, len, len1, m, mod_key, n, non_modifier_keys, property, ref, ref1, validated, value;
    validated = true;
    if (!combo.keys.length) {
      _log_error("You're trying to bind a combo with no keys:", combo);
    }
    for (i = l = 0, ref = combo.keys.length; 0 <= ref ? l < ref : l > ref; i = 0 <= ref ? ++l : --l) {
      key = combo.keys[i];
      alt_name = _keycode_alternate_names[key];
      if (alt_name) {
        key = combo.keys[i] = alt_name;
      }
      if (key === "meta") {
        combo.keys.splice(i, 1, _metakey);
      }
      if (key === "cmd") {
        _log_error("Warning: use the \"meta\" key rather than \"cmd\" for Windows compatibility");
      }
    }
    ref1 = combo.keys;
    for (m = 0, len = ref1.length; m < len; m++) {
      key = ref1[m];
      if (!_key_is_valid(key)) {
        _log_error("Do not recognize the key \"" + key + "\"");
        validated = false;
      }
    }
    if (indexOf.call(combo.keys, "meta") >= 0 || indexOf.call(combo.keys, "cmd") >= 0) {
      non_modifier_keys = combo.keys.slice();
      for (n = 0, len1 = _modifier_keys.length; n < len1; n++) {
        mod_key = _modifier_keys[n];
        if ((i = _index_of_in_array.call(non_modifier_keys, mod_key)) > -1) {
          non_modifier_keys.splice(i, 1);
        }
      }
      if (non_modifier_keys.length > 1) {
        _log_error("META and CMD key combos cannot have more than 1 non-modifier keys", combo, non_modifier_keys);
        validated = false;
      }
    }
    for (property in combo) {
      value = combo[property];
      if (_factory_defaults[property] === "undefined") {
        _log_error("The property " + property + " is not a valid combo property. Your combo has still been registered.");
      }
    }
    return validated;
  };

  _convert_to_shifted_key = function(key, e) {
    var k;
    if (!e.shiftKey) {
      return false;
    }
    k = _keycode_shifted_keys[key];
    if (k != null) {
      return k;
    }
    return false;
  };

  _modifier_event_mapping = {
    "cmd": "metaKey",
    "ctrl": "ctrlKey",
    "shift": "shiftKey",
    "alt": "altKey"
  };

  _keycode_alternate_names = {
    "escape": "esc",
    "control": "ctrl",
    "command": "cmd",
    "break": "pause",
    "windows": "cmd",
    "option": "alt",
    "caps_lock": "caps",
    "apostrophe": "\'",
    "semicolon": ";",
    "tilde": "~",
    "accent": "`",
    "scroll_lock": "scroll",
    "num_lock": "num"
  };

  _keycode_shifted_keys = {
    "/": "?",
    ".": ">",
    ",": "<",
    "\'": "\"",
    ";": ":",
    "[": "{",
    "]": "}",
    "\\": "|",
    "`": "~",
    "=": "+",
    "-": "_",
    "1": "!",
    "2": "@",
    "3": "#",
    "4": "$",
    "5": "%",
    "6": "^",
    "7": "&",
    "8": "*",
    "9": "(",
    "0": ")"
  };

  _keycode_dictionary = {
    0: "\\",
    8: "backspace",
    9: "tab",
    12: "num",
    13: "enter",
    16: "shift",
    17: "ctrl",
    18: "alt",
    19: "pause",
    20: "caps",
    27: "esc",
    32: "space",
    33: "pageup",
    34: "pagedown",
    35: "end",
    36: "home",
    37: "left",
    38: "up",
    39: "right",
    40: "down",
    44: "print",
    45: "insert",
    46: "delete",
    48: "0",
    49: "1",
    50: "2",
    51: "3",
    52: "4",
    53: "5",
    54: "6",
    55: "7",
    56: "8",
    57: "9",
    65: "a",
    66: "b",
    67: "c",
    68: "d",
    69: "e",
    70: "f",
    71: "g",
    72: "h",
    73: "i",
    74: "j",
    75: "k",
    76: "l",
    77: "m",
    78: "n",
    79: "o",
    80: "p",
    81: "q",
    82: "r",
    83: "s",
    84: "t",
    85: "u",
    86: "v",
    87: "w",
    88: "x",
    89: "y",
    90: "z",
    91: "cmd",
    92: "cmd",
    93: "cmd",
    96: "num_0",
    97: "num_1",
    98: "num_2",
    99: "num_3",
    100: "num_4",
    101: "num_5",
    102: "num_6",
    103: "num_7",
    104: "num_8",
    105: "num_9",
    106: "num_multiply",
    107: "num_add",
    108: "num_enter",
    109: "num_subtract",
    110: "num_decimal",
    111: "num_divide",
    112: "f1",
    113: "f2",
    114: "f3",
    115: "f4",
    116: "f5",
    117: "f6",
    118: "f7",
    119: "f8",
    120: "f9",
    121: "f10",
    122: "f11",
    123: "f12",
    124: "print",
    144: "num",
    145: "scroll",
    186: ";",
    187: "=",
    188: ",",
    189: "-",
    190: ".",
    191: "/",
    192: "`",
    219: "[",
    220: "\\",
    221: "]",
    222: "\'",
    223: "`",
    224: "cmd",
    225: "alt",
    57392: "ctrl",
    63289: "num",
    59: ";",
    61: "=",
    173: "-"
  };

  keypress._keycode_dictionary = _keycode_dictionary;

  keypress._is_array_in_array_sorted = _is_array_in_array_sorted;

  _decide_meta_key();

  _change_keycodes_by_browser();

  if (typeof define === "function" && define.amd) {
    define([], function() {
      return keypress;
    });
  } else if (typeof exports !== "undefined" && exports !== null) {
    exports.keypress = keypress;
  } else {
    window.keypress = keypress;
  }

}).call(this);
