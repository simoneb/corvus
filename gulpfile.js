var gulp = require('gulp');
var gutil = require('gulp-util');
var xeditor = require("gulp-xml-editor");
var jeditor = require("gulp-json-editor");
var fmt = require('util').format;
var path = require('path');

require('shelljs/global');

var newVersion;

gulp.task('default', ['install']);

// TODO: move this to a cordova hook
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
  return gulp.src('package.json')
      .pipe(jeditor(function (json) {
        console.log(gutil.colors.green('New version: ' + json.version));
        exec(fmt('git add package.json www/config.xml && git commit -m "Bump version to %s"', json.version));
        return json;
      }));
});

function increaseRevision(version) {
  return version.replace(/\d+$/, parseInt(/\d+$/.exec(version), 10) + 1);
}

gulp.task('bump-package.json', function () {
  return gulp.src('package.json')
      .pipe(jeditor(function (json) {
        json.version = increaseRevision(json.version);
        return json;
      }))
      .pipe(gulp.dest('.'));
});

gulp.task('bump-config.xml', ['bump-package.json'], function () {
  return gulp.src('www/config.xml')
      .pipe(xeditor(function (xml) {
        xml.root().attr({ version: increaseRevision(xml.root().attr('version').value()) });
        xml.root().attr({ versionCode: increaseRevision(xml.root().attr('versionCode').value()) });
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

gulp.task('release', function () {
  var jarSigner = path.join(process.env.JAVA_HOME, 'bin', 'jarsigner.exe'),
      zipAlign = process.env['PROGRAMFILES(x86)'] + '/Android/android-sdk/build-tools/20.0.0/zipalign.exe';

  pushd('platforms/android/ant-build');

  rm('corvus-release.apk');

  exec('cordova build --release android');

  exec(fmt('"%s" -verbose -sigalg SHA1withRSA -digestalg SHA1', jarSigner) +
  fmt(' -keystore ', path.join(process.env.userprofile, 'android-release-key.keystore')) +
  ' -storepass QyezKqpSLQkm corvus-release-unsigned.apk android-key');

  exec(fmt('"%s" -v 4 corvus-release-unsigned.apk corvus-release.apk', zipAlign));

  popd();
});

