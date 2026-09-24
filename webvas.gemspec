# frozen_string_literal: true

require_relative "lib/webvas/version"

Gem::Specification.new do |spec|
  spec.name = "webvas"
  spec.version = Webvas::VERSION
  spec.authors = ["Yudai Takada"]
  spec.email = ["t.yudai92@gmail.com"]
  spec.summary = "Run Ruby graphics in the browser"
  spec.description = "An RBGL canvas backend, WebGPU shader bridge, and browser playground powered by ruby.wasm."
  spec.homepage = "https://github.com/rbgfx/webvas"
  spec.license = "MIT"
  spec.required_ruby_version = ">= 3.1.0"
  spec.metadata["homepage_uri"] = spec.homepage
  spec.metadata["source_code_uri"] = "#{spec.homepage}/tree/main"
  spec.metadata["rubygems_mfa_required"] = "true"

  spec.files = Dir["lib/**/*", "js/**/*", "site/**/*", "sig/**/*", "docs/**/*", "script/**/*", "patches/**/*", "exe/*",
                   "runtime/Gemfile", "runtime/Gemfile.lock",
                   "README.md", "CHANGELOG.md", "LICENSE.txt"].select { |file| File.file?(file) }
  spec.bindir = "exe"
  spec.executables = spec.files.grep(%r{\Aexe/}) { |file| File.basename(file) }
  spec.require_paths = ["lib"]

  spec.add_dependency "rbgl", ">= 1.0.0", "< 2"
  spec.add_dependency "glaze", ">= 0.1.0", "< 0.2"
  spec.add_dependency "base64", "~> 0.2"
  spec.add_development_dependency "rake", "~> 13.0"
  spec.add_development_dependency "rbs", "~> 3.0"
  spec.add_development_dependency "rubocop", "~> 1.0"
  spec.add_development_dependency "simplecov", "~> 0.22"
  spec.add_development_dependency "test-unit", "~> 3.6"
end
