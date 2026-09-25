# frozen_string_literal: true

module Webvas
  class Shader
    attr_reader :wgsl, :canvas

    def initialize(wgsl, canvas: "#screen")
      @wgsl = String(wgsl)
      @canvas = String(canvas)
      raise ArgumentError, "WGSL source cannot be empty" if @wgsl.empty?
    end
  end
end
