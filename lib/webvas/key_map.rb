# frozen_string_literal: true

module Webvas
  module KeyMap
    DIGITS = %i[zero one two three four five six seven eight nine].freeze
    SPECIAL = {
      "ArrowLeft" => :left, "ArrowRight" => :right, "ArrowUp" => :up, "ArrowDown" => :down,
      "Backspace" => :backspace, "Delete" => :delete, "Enter" => :enter, "Escape" => :escape,
      "Home" => :home, "End" => :end, "PageUp" => :page_up, "PageDown" => :page_down,
      "Tab" => :tab, "Space" => :space, "ShiftLeft" => :left_shift, "ShiftRight" => :right_shift,
      "ControlLeft" => :left_control, "ControlRight" => :right_control,
      "AltLeft" => :left_alt, "AltRight" => :right_alt, "MetaLeft" => :left_meta, "MetaRight" => :right_meta,
      "Minus" => :minus, "Equal" => :equal, "BracketLeft" => :left_bracket,
      "BracketRight" => :right_bracket, "Backslash" => :backslash, "Semicolon" => :semicolon,
      "Quote" => :quote, "Comma" => :comma, "Period" => :period, "Slash" => :slash, "Backquote" => :grave
    }.freeze

    module_function

    def call(code, key = nil)
      code = String(code)
      return SPECIAL.fetch(code) if SPECIAL.key?(code)
      return key.downcase.to_sym if code.start_with?("Key") && key.to_s.length == 1
      return DIGITS.fetch(code.delete_prefix("Digit").to_i) if code.match?(/\ADigit[0-9]\z/)
      return code.downcase.to_sym if code.match?(/\AF\d{1,2}\z/)

      key.to_s.length == 1 ? key.downcase.to_sym : code.downcase.to_sym
    end
  end
end
