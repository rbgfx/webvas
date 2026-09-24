# frozen_string_literal: true

module Webvas
  module Input
    MODIFIERS = { "shiftKey" => :shift, "ctrlKey" => :control, "altKey" => :alt, "metaKey" => :meta }.freeze
    BUTTONS = { 0 => 1, 1 => 2, 2 => 3 }.freeze

    module_function

    def translate(events, width:, height:)
      events.filter_map { |event| convert(event, width:, height:) }
    end

    def convert(event, width:, height:)
      case type = event.fetch("type")
      when "pointerdown", "pointerup", "pointermove"
        x, y = coordinates(event, width:, height:)
        name = { "pointerdown" => :mouse_press, "pointerup" => :mouse_release, "pointermove" => :mouse_move }.fetch(type)
        data = { x:, y:, modifiers: modifiers(event) }
        data[:button] = BUTTONS.fetch(event.fetch("button", 0), event.fetch("button", 0)) unless type == "pointermove"
        RBGL::GUI::Event.new(name, **data)
      when "keydown", "keyup"
        name = type == "keydown" ? :key_press : :key_release
        key = KeyMap.call(event.fetch("code", ""), event["key"])
        RBGL::GUI::Event.new(name, key:, keycode: event["code"], char: printable(event["key"]), modifiers: modifiers(event))
      when "wheel"
        RBGL::GUI::Event.new(:scroll, dx: event.fetch("deltaX", 0), dy: event.fetch("deltaY", 0), modifiers: modifiers(event))
      end
    end

    def coordinates(event, width:, height:)
      width = Integer(width)
      height = Integer(height)
      raise ArgumentError, "canvas size must be positive" unless width.positive? && height.positive?

      rect_width = Float(event.fetch("rectWidth"))
      rect_height = Float(event.fetch("rectHeight"))
      return [0, 0] unless rect_width.positive? && rect_height.positive?

      x = ((Float(event.fetch("clientX")) - Float(event.fetch("left"))) * width / rect_width).floor
      y = ((Float(event.fetch("clientY")) - Float(event.fetch("top"))) * height / rect_height).floor
      [x.clamp(0, width - 1), y.clamp(0, height - 1)]
    end

    def modifiers(event)
      MODIFIERS.filter_map { |key, value| value if event[key] }
    end

    def printable(key)
      key if key.is_a?(String) && key.length == 1
    end
  end
end
