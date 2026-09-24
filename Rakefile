# frozen_string_literal: true

require "bundler/gem_tasks"
require "rake/testtask"
require "rbs"
require "rubocop/rake_task"

Rake::TestTask.new(:test) do |task|
  task.libs << "lib"
  task.pattern = "test/**/*_test.rb"
end
RuboCop::RakeTask.new(:lint) do |task|
  task.options = ["--lint", "--cache", "false", "lib", "test", "exe", "Rakefile", "webvas.gemspec"]
end

task :types do
  sh "bundle exec rbs -I sig validate"
end

task :javascript do
  %w[js/bridge.js js/loader.js site/app.js site/worker.js ../glaze/lib/glaze/webgpu_runner.js].each do |file|
    sh "node", "--check", file if file.end_with?(".js")
  end
end

task verify: %i[lint test types javascript]
task default: :verify
