function HttpClient($http, $q, $injector, options) {
  var authData;

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
          noCache: Date.now()
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

    function parseAuthData(data) {
      return _.compact(data.split(',')).reduce(function (acc, item) {
        var items = item.split('=');

        var value = items.length > 2 ? items.slice(1).join('=') : items[1];

        acc[items[0].trim()] = (value || '').trim();

        return acc;
      }, {});
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

  this.get = function (path, params) {
    return http('GET', path, createConfig(params));
  };

  this.post = function (path, data, params) {
    return http('POST', path, angular.extend({ data: data }, createConfig(params)));
  };

  this.put = function (path, data, headers, params) {
    return http('PUT', path, angular.extend({ data: data, headers: headers }, createConfig(params)));
  };

  this.del = function (path, params) {
    return http('DELETE', path, createConfig(params));
  };
}

function RavenClient($injector, $rootScope, options) {
  options = angular.copy(options);

  if (options.database) {
    options.url = options.url + '/databases/' + options.database;
    delete options.database;
  }

  var http = $injector.instantiate(HttpClient, { options: options });

  function buildQuery(queryObj) {
    return _.reduce(queryObj,
        function (acc, val, key) {
          return ',' + acc + key + ':' + val
        }, '').substr(1);
  }

  this.isV3 = function () {
    return /^3/.test(options.serverVersion);
  };

  /**
   * Gets the databases on the server
   * @param {object=} params Arguments to pass on the query string
   * @param {number} [params.start] Index of first result to return
   * @param {number} [params.pageSize] Maximum number of results to return
   * @param {boolean} [params.getAdditionalData=false] Whether to return additional data
   * */
  this.getDatabases = function (params) {
    return http.get('/databases', params);
  };

  /**
   * Gets the file systems on the server
   * @param {object=} params Arguments to pass on the query string
   * @param {number} [params.start] Index of first result to return
   * @param {number} [params.pageSize] Maximum number of results to return
   * @param {boolean} [params.getAdditionalData=false] Whether to return additional data
   * */
  this.getFileSystems = function () {
    return http.get('/fs');
  };

  /**
   * Retrieves a document by its id
   * @param {string} id The id of the document
   * */
  this.getDocument = function (id, params) {
    return http.get('/docs/' + id, params);
  };

  /**
   * Saves a document
   * @param {string} id The id of the document
   * @param {object} metadata The metadata of the document
   * @param {object} data The contents of the document
   * */
  this.saveDocument = function (id, metadata, data, params) {
    return http.put('/docs/' + id, data, {
      'Raven-Entity-Name': metadata['Raven-Entity-Name'],
      'Raven-Clr-Type': metadata['Raven-Clr-Type'],
      'If-None-Match': metadata['@etag']
    }, params)
        .then(function (res) {
          $rootScope.$broadcast('raven:document:saved', id, metadata, data, res);
          return res;
        });
  };

  this.deleteDocument = function (id, params) {
    return http.del('/docs/' + id, params)
        .then(function (res) {
          $rootScope.$broadcast('raven:document:deleted', id, res);
          return res;
        });
  };

  this.deleteIndex = function (name, params) {
    return http.del('/indexes/' + name, params)
        .then(function (res) {
          $rootScope.$broadcast('raven:index:deleted', name, res);
          return res;
        });
  };

  /**
   * Gets a list of documents
   * @param {object=} params Arguments to pass on the query string
   * @param {number} [params.start] Index of first result to return
   * @param {number} [params.pageSize] Maximum number of results to return
   * @param {boolean} [params.metadata-only=false] Whether to return only metadata
   * @param {string} [params.startsWith]
   * @param {string} [params.exclude]
   * */
  this.getDocuments = function (params) {
    return http.get('/docs', params);
  };

  this.getAlerts = function (params) {
    return http.get('/docs/Raven/Alerts', params);
  };

  /**
   * Queries an index
   * @param {string} indexName
   * @param {string=} query
   * @param {string=} params.sort Example: LastModified
   * @param {string=} params.start
   * @param {string=} params.pageSize
   * */
  this.queryIndex = function (indexName, query, params) {
    return http.get('/indexes/' + indexName, _.merge({ 'query': buildQuery(query) }, params));
  };

  /*
   * metadata-only true/false
   * */
  this.queries = function (params) {
    return http.get('/queries', params);
  };

  /*
   field
   fromValue
   pageSize
   */
  this.getTerms = function (indexName, params) {
    return http.get('/terms/' + indexName, params);
  };

  /*
   parallel: yes / no
   * */
  this.multiGet = function (requests, parallel, params) {
    return http.post('/multi_get', requests, angular.extend({ parallel: parallel ? 'yes' : 'no' }, params));
  };

  this.debug = {
    getUserInfo: function (params) {
      return http.get('/debug/user-info', params);
    },
    getMetrics: function (params) {
      return http.get('/debug/metrics', params);
    },
    getConfig: function (params) {
      return http.get('/debug/config', params);
    },
    getTasks: function (params) {
      return http.get('/debug/tasks', params);
    },
    getQueries: function (params) {
      return http.get('/debug/queries');
    },
    getChanges: function (params) {
      return http.get('/debug/changes');
    },
    getCurrentlyIndexing: function (params) {
      return http.get('/debug/currently-indexing');
    },
    getRoutes: function (params) {
      return http.get('/debug/routes');
    },
    getRequestTracing: function (params) {
      return http.get('/debug/request-tracing');
    },
    getSlowDocCounts: function (params) {
      return http.get('/debug/sl0w-d0c-c0unts');
    },
    getIdentities: function (params) {
      return http.get('/debug/identities');
    },
    getIndexingPerfStats: function (params) {
      return http.get('/debug/indexing-perf-stats');
    },
    suggestIndexMerge: function (params) {
      return http.get('/debug/suggest-index-merge');
    }
  };

  this.getLogs = function (params) {
    return http.get('/logs', params);
  };

  this.getStats = function (params) {
    return http.get('/stats', params)
  };

  this.getRunningTasks = function (params) {
    return http.get('/operations');
  };

  /*
   * definition yes / no
   * */
  this.getIndex = function (indexName, params) {
    return http.get('/indexes/' + indexName, params);
  };

  this.getTransformers = function (params) {
    return http.get('/transformers', params);
  };

  this.getTransformer = function (transformerName, params) {
    return http.get('/transformers/' + transformerName, params);
  };

  this.getBuildVersion = function (params) {
    return http.get('/build/version', params);
  };

  this.getLicenseStatus = function (params) {
    return http.get('/license/status', params);
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
    return http.put('/admin/databases/' + databaseName, data, {}, params);
  };

  // v3 only?
  this.getSingleAuthToken = function () {
    return http.get('/singleAuthToken');
  };

  /**
   * Gets the facets
   * @param {string} indexName The name of the index to query
   * @param {object[]} [params.facets] Example: [{"Name":"Tag"}]
   * */
  this.getFacets = function (indexName, params) {
    if (params && params.facets) {
      params.facets = [params.facets];
    }

    return http.get('/facets/' + indexName, params);
  };
}

angular.module('ngRaven', [])
    .provider('raven', function () {
      var self = this;

      self.defaults = {
        requestErrorHandlers: [],
        responseErrorHandlers: []
      };

      self.$get = function ($injector) {
        return function (options) {
          var localOptions = angular.extend({}, self.defaults, options);

          return $injector.instantiate(RavenClient, { options: localOptions });
        };
      };
    });