var gulp = require('gulp');
var gutil = require('gulp-util');

require('shelljs/global');

gulp.task('default', ['install']);

gulp.task('install', ['git-check'], function () {
  exec('git submodule init');

  ['com.ionic.keyboard',
    'org.apache.cordova.console',
    'org.apache.cordova.dialogs',
    'https://github.com/Paldom/SpinnerDialog.git',
    'https://github.com/EddyVerbruggen/Toast-PhoneGap-Plugin.git',
    'AndroidInAppBilling/v3']
      .forEach(function (plugin) {
        "use strict";
        exec('ionic plugin add ' + plugin);
      });

  exec('ionic platform add android');
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
