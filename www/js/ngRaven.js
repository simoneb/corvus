function RavenClient(options, $injector, $http, $q) {
  var authData;

  if (options.database) {
    options.url = options.url + '/databases/' + options.database;
    delete options.database;
  }

  function http(method, path, config) {
    function callImmediate() {
      var headers = {
        'Has-Api-Key': !!options.apiKey,
        'Raven-Client-Version': '2.5.0.0'
      };

      if (authData) {
        headers['Authorization'] = 'Bearer ' + angular.toJson(authData);
      }

      return $http(_.merge({
        method: method,
        url: options.url + path,
        headers: headers,
        params: {
          //noCache: Date.now()
        }
      }, config));
    }

    function hash(data) {
      var md = forge.md.sha1.create();
      md.update(data);
      return forge.util.encode64(md.digest().getBytes());
    }

    function base64ToBigInt(input) {
      input = forge.util.decode64(input);
      var hex = forge.util.bytesToHex(input);
      return new forge.jsbn.BigInteger(hex, 16);
    }

    function encryptData(cryptoData, apiKeyName, apiSecret) {
      var data = objectToString({
            "api key name": apiKeyName,
            challenge: cryptoData.challenge,
            response: hash(cryptoData.challenge + ';' + apiSecret)
          }),
          e = base64ToBigInt(cryptoData.serverRSAExponent),
          m = base64ToBigInt(cryptoData.serverRSAModulus),
          rsa = forge.pki.rsa,
          publicKey = rsa.setPublicKey(m, e),
          key = forge.random.getBytesSync(32),
          iv = forge.random.getBytesSync(16),
          keyAndIvEncrypted = publicKey.encrypt(key + iv, 'RSA-OAEP'),
          cipher = forge.cipher.createCipher('AES-CBC', key);

      cipher.start({ iv: iv });
      cipher.update(forge.util.createBuffer(data));
      cipher.finish();

      var encrypted = cipher.output;

      return forge.util.encode64(keyAndIvEncrypted + encrypted.data);
    }

    function objectToString(dict) {
      return _.map(dict, function (value, key) {
        return key + '=' + value;
      }).join(',');
    }

    function authenticateWithEncryption(oauthSource, cryptoData) {
      var postData;

      if (cryptoData) {
        var apiKeyParts = options.apiKey.split('/'),
            apiKeyName, apiSecret;

        if (apiKeyParts.length > 2) {
          apiKeyParts[1] = apiKeyParts.slice(1).join('/');
        }

        apiKeyName = apiKeyParts[0].trim();
        apiSecret = apiKeyParts[1].trim();

        postData = objectToString({
          exponent: cryptoData.serverRSAExponent,
          modulus: cryptoData.serverRSAModulus,
          data: encryptData(cryptoData, apiKeyName, apiSecret)
        });
      }

      return $http.post(oauthSource, postData, {
        'grant_type': 'client_credentials'
      }).then(function (res) {
        authData = res.data;
      }, function (res) {
        if (res.status !== 412) {
          return $q.reject(res);
        }

        var wwwAuthenticate = res.headers('www-authenticate');

        if (!wwwAuthenticate || !/^Raven /.test(wwwAuthenticate)) {
          return $q.reject(res);
        }

        var dict = parseAuthData(wwwAuthenticate.substring('Raven '.length).trim()),
            serverRSAExponent = dict.exponent,
            serverRSAModulus = dict.modulus,
            challenge = dict.challenge;

        if (!serverRSAExponent || !serverRSAModulus || !challenge) {
          return $q.reject(res);
        }

        return authenticateWithEncryption(oauthSource, {
          serverRSAExponent: serverRSAExponent,
          serverRSAModulus: serverRSAModulus,
          challenge: challenge
        });
      });
    }

    function parseAuthData(data) {
      return _.compact(data.split(',')).reduce(function (acc, item) {
        var items = item.split('=');

        var value = items.length > 2 ? items.slice(1).join('=') : items[1];

        acc[items[0].trim()] = (value || '').trim();

        return acc;
      }, {});
    }

    function authenticateWithLegacyApiKey(oauthSource) {
      return $http.get(oauthSource, {
        headers: {
          'Api-Key': options.apiKey,
          'grant_type': 'client_credentials'
        }
      }).success(function (_authData) {
        authData = _authData;
      });
    }

    function tryAuthenticateWithApiKey(res) {
      if (!options.apiKey) return $q.reject(res);

      var oauthSource = res.headers('oauth-source');

      if (res.status === 401 || res.status === 403 || res.status === 412) {
        if (oauthSource && !/\/OAuth\/API-Key$/i.test(oauthSource)) {
          return authenticateWithLegacyApiKey(oauthSource);
        }

        if (!oauthSource) {
          oauthSource = options.url + '/OAuth/API-Key';
        }

        return authenticateWithEncryption(oauthSource);
      } else {
        return $q.reject(res);
      }
    }

    function handleError(res) {
      if (options.responseErrorHandlers.length) {
        return $q.all(options.responseErrorHandlers.map(function (fn) {
          return $injector.invoke(fn)(res);
        }));
      }

      return $q.reject(res);
    }

    return callImmediate().catch(function (res) {
      return tryAuthenticateWithApiKey(res)
          .then(function () {
            return callImmediate().catch(handleError);
          }, handleError);
    });
  }

  function createConfig(params) {
    var config = {};

    if (!params) return config;

    config.ignoreErrors = angular.isArray(params.ignoreErrors) ? params.ignoreErrors : [params.ignoreErrors];
    delete params.ignoreErrors;
    config.params = params;

    return config;
  }

  function get(path, params) {
    return http('GET', path, createConfig(params));
  }

  function post(path, data, params) {
    return http('POST', path, angular.extend({ data: data }, createConfig(params)));
  }

  function put(path, data, headers, params) {
    return http('PUT', path, angular.extend({ data: data, headers: headers }, createConfig(params)));
  }

  function del(path, params) {
    return http('DELETE', path, createConfig(params));
  }

  function buildQuery(queryObj) {
    return _.reduce(queryObj,
        function (acc, val, key) {
          return ',' + acc + key + ':' + val
        }, '').substr(1);
  }

  this.getDatabases = function (params) {
    return get('/databases', params);
  };
  this.getDocument = function (documentId, params) {
    return get('/docs/' + documentId, params);
  };
  this.saveDocument = function (documentId, documentMetadata, data, params) {
    return put('/docs/' + documentId, data, {
      'Raven-Entity-Name': documentMetadata['Raven-Entity-Name'],
      'Raven-Clr-Type': documentMetadata['Raven-Clr-Type'],
      'If-None-Match': documentMetadata['@etag']
    }, params);
  };
  this.deleteDocument = function (documentId, params) {
    return del('/docs/' + documentId, params);
  };
  /*
   * start
   * pageSize
   * metadata-only true | false?
   * startsWith
   * exclude
   * */
  this.getDocuments = function (params) {
    return get('/docs', params);
  };
  this.getAlerts = function (params) {
    return get('/docs/Raven/Alerts', params);
  };
  this.queryIndex = function (indexName, query, params) {
    return get('/indexes/' + indexName, _.merge({ 'query': buildQuery(query) }, params));
  };
  /*
   * metadata-only true/false
   * */
  this.queries = function (params) {
    return get('/queries', params);
  };
  /*
   field
   fromValue
   pageSize
   */
  this.getTerms = function (indexName, params) {
    return get('/terms/' + indexName, params);
  };
  /*
   parallel: yes / no
   * */
  this.multiGet = function (requests, parallel, params) {
    return post('/multi_get', requests, angular.extend({ parallel: parallel ? 'yes' : 'no' }, params));
  };
  this.getUser = function (params) {
    return get('/debug/user-info', params);
  };
  this.getConfig = function (params) {
    return get('/debug/config', params);
  };
  this.getStats = function (params) {
    return get('/stats', params)
  };
  /*
   * definition yes / no
   * */
  this.getIndex = function (indexName, params) {
    return get('/indexes/' + indexName, params);
  };
  this.getTransformer = function (transformerName, params) {
    return get('/transformers/' + transformerName, params);
  };
  this.getBuildVersion = function (params) {
    return get('/build/version', params);
  };
  this.getLicenseStatus = function (params) {
    return get('/license/status', params);
  };

  /*
   * data:
   * {
   "Settings": {
   "Raven/DataDir": "~\\Databases\\firstDb",
   "Raven/ActiveBundles": "PeriodicBackup"
   },
   "SecuredSettings": {},
   "Disabled": false
   }
   * */
  this.createDatabase = function (databaseName, data, params) {
    return put('/admin/databases/' + databaseName, data, {}, params);
  }
}

angular.module('ngRaven', [])
    .provider('raven', function () {
      var self = this;

      self.defaults = {
        requestErrorHandlers: [],
        responseErrorHandlers: []
      };

      self.$get = function ($injector, $http, $q) {
        return function (options) {
          var localOptions = angular.extend({}, self.defaults, options);

          if (/^3/.test(options.serverVersion)) {
            return new RavenClient(localOptions, $injector, $http, $q);
          }

          return new RavenClient(localOptions, $injector, $http, $q);
        };
      };
    });