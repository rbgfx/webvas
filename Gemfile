source "https://rubygems.org"

gemspec

gem "rake", "~> 13.0"
gem "rbs", "~> 3.0"
gem "rubocop", "~> 1.0"
gem "simplecov", "~> 0.22"
gem "test-unit", "~> 3.6"

%w[larb rbgl tessel].each do |name|
  path = File.expand_path("../#{name}", __dir__)
  if File.file?(File.join(path, "#{name}.gemspec"))
    gem name, path: path
  else
    gem name
  end
end
