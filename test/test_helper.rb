# frozen_string_literal: true

require "simplecov"

SimpleCov.start do
  add_filter "/test/"
  add_filter "/exe/"
  minimum_coverage 85
end

require "base64"
require "json"
require "test/unit"
require_relative "../lib/webvas"
