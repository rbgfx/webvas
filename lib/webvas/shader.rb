# frozen_string_literal: true

require "json"

module Webvas
  class Shader
    DEFAULT_LAYOUT = {
      fields: {
        resolution: { offset: 0, type: :vec2 },
        time: { offset: 8, type: :float },
        frame: { offset: 12, type: :int },
        mouse: { offset: 16, type: :vec4 }
      },
      size: 32
    }.freeze

    attr_reader :source, :canvas, :layout

    def initialize(source, canvas: "#screen", layout: nil)
      @source = String(source)
      @canvas = String(canvas)
      @layout = layout || DEFAULT_LAYOUT
    end

    def run(canvas: @canvas, bridge: Bridge.new, &uniforms)
      stop
      callback = proc { |time| JSON.generate(uniforms ? uniforms.call(Float(time)) : {}) }
      @runner = bridge.run_shader(String(canvas), @source, JSON.generate(@layout), callback)
    end

    def stop
      @runner.stop if @runner
      @runner = nil
    end
  end
end
