var gulp = require('gulp');
var gutil = require('gulp-util');
var sh = require('shelljs');

gulp.task('default', ['install']);

gulp.task('install', ['git-check'], function () {
  ['com.ionic.keyboard',
    'org.apache.cordova.console',
    'org.apache.cordova.dialogs',
    'https://github.com/Paldom/SpinnerDialog.git',
    'https://github.com/EddyVerbruggen/Toast-PhoneGap-Plugin.git']
      .forEach(function (plugin) {
        "use strict";
        sh.exec('ionic plugin add ' + plugin);
      });

  sh.exec('ionic platform add android');
});

gulp.task('git-check', function (done) {
  if (!sh.which('git')) {
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
