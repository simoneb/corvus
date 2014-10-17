#!/usr/bin/env node

var fs = require('fs');
var path = require('path');

var root = process.argv[2],
    androidRoot = path.join(root, 'platforms', 'android'),
    destinationFile = path.join(androidRoot, 'res', 'values', 'billing_key.xml'),
    licenseKey = fs.readFileSync(path.join(root, 'android-license-key'));

if (fs.existsSync(androidRoot)) {
  console.log('Writing android billing configuration');

  fs.writeFileSync(destinationFile,
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<resources>' +
      '<string name="billing_key">' + licenseKey + '</string>' +
      '</resources>');
}