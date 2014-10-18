var gulp = require('gulp');
var gutil = require('gulp-util');
var xeditor = require("gulp-xml-editor");
var jeditor = require("gulp-json-editor");

require('shelljs/global');

var newVersion;

gulp.task('default', ['install']);

gulp.task('install', ['git-check'], function () {
  exec('git submodule init');

  ['com.ionic.keyboard',
    'org.apache.cordova.console',
    'org.apache.cordova.dialogs',
    'https://github.com/Paldom/SpinnerDialog.git',
    'https://github.com/EddyVerbruggen/Toast-PhoneGap-Plugin.git',
    {
      name: 'AndroidInAppBilling/v3',
      options: ['--variable BILLING_KEY="MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlWtqn9TWvawMDRrykB0OipCwYnArAkinOPq7kb7B7qxokqTmS1maKlxzeAPxwvzYP49u9GNeNJfsqup2E4dR0hiigHQuqmJROUNEOtTxJaIhNLKQaOlC7Bdbvi1n00a5xbb7+kNlIPlo0rtuE2vrj6L3mGV7zKGmsCMU2mPRcE96jMc/kkWsUQnx373MJsgoXq0plUdrkMLhByS4ufKMS1lAebvRPsdkO1dCE3v6ktDyfcdjijMcgTVCqIHtUh6fbidmUClxkNOTsJms+muZyClFGQwvYfZ1+rb00FCcdN6IohJw5crzC3VXL6zlJQhB5SUsv+DuRi9msp0nLFGANwIDAQAB"']
    },
    'https://github.com/EddyVerbruggen/cordova-plugin-actionsheet.git',
    'org.apache.cordova.inappbrowser',
    'org.apache.cordova.statusbar'
  ]
      .forEach(function (plugin) {
        if (typeof plugin == 'object') {
          exec('cordova plugin add ' + plugin.name + ' ' + plugin.options.join(' '));
        } else {
          exec('cordova plugin add ' + plugin);
        }
      });

  exec('cordova platform add android');
});

gulp.task('bump', ['bump-package.json', 'bump-config.xml'], function () {
  exec('git add package.json www/config.xml && git commit -m "Bump version to ' + newVersion + '"');
  console.log(gutil.colors.green('New version: ' + newVersion));
});

gulp.task('bump-package.json', function () {
  return gulp.src('package.json')
      .pipe(jeditor(function (json) {
        var patch = parseInt(/\d+$/.exec(json.version), 10) + 1;
        json.version = newVersion = json.version.replace(/\d+$/, patch);
        return json;
      }))
      .pipe(gulp.dest('.'));
});

gulp.task('bump-config.xml', ['bump-package.json'], function () {
  return gulp.src('www/config.xml')
      .pipe(xeditor(function (xml) {
        xml.root().attr({ version: newVersion });
        return xml;
      }))
      .pipe(gulp.dest('www'));
});

gulp.task('git-check', function (done) {
  if (!which('git')) {
    console.log(
        '  ' + gutil.colors.red('Git is not installed.'),
        '\n  Git, the version control system, is required to download Ionic.',
        '\n  Download git here:', gutil.colors.cyan('http://git-scm.com/downloads') + '.',
        '\n  Once git is installed, run \'' + gutil.colors.cyan('gulp install') + '\' again.'
    );
    process.exit(1);
  }
  done();
});
