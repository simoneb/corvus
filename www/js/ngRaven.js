function HttpClient($http, $q, $injector, options) {
  var authData;

  this.http = function (method, path, config) {
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
  };

  this.createConfig = function (params) {
    var config = {};

    if (!params) return config;

    config.ignoreErrors = angular.isArray(params.ignoreErrors) ? params.ignoreErrors : [params.ignoreErrors];
    delete params.ignoreErrors;
    config.params = params;

    return config;
  };
}

HttpClient.prototype.get = function (path, params) {
  return this.http('GET', path, this.createConfig(params));
};

HttpClient.prototype.post = function (path, data, params) {
  return this.http('POST', path, angular.extend({ data: data }, this.createConfig(params)));
};

HttpClient.prototype.put = function (path, data, headers, params) {
  return this.http('PUT', path, angular.extend({ data: data, headers: headers }, this.createConfig(params)));
};

HttpClient.prototype.del = function (path, params) {
  return this.http('DELETE', path, this.createConfig(params));
};

function RavenClient($injector, $rootScope, options) {
  options = angular.copy(options);

  this.$rootScope = $rootScope;

  if (options.database) {
    options.url = options.url + '/databases/' + options.database;
    delete options.database;
  }

  this.http = $injector.instantiate(HttpClient, { options: options });

  this.isV3 = function () {
    return /^3/.test(options.serverVersion);
  };

  this.debug.init(this.http);
}

/**
 * Gets the databases on the server
 * @param {object=} params Arguments to pass on the query string
 * @param {number} [params.start] Index of first result to return
 * @param {number} [params.pageSize] Maximum number of results to return
 * @param {boolean} [params.getAdditionalData=false] Whether to return additional data
 * */
RavenClient.prototype.getDatabases = function (params) {
  return this.http.get('/databases', params);
};

/**
 * Gets the file systems on the server
 * @param {object=} params Arguments to pass on the query string
 * @param {number} [params.start] Index of first result to return
 * @param {number} [params.pageSize] Maximum number of results to return
 * @param {boolean} [params.getAdditionalData=false] Whether to return additional data
 * */
RavenClient.prototype.getFileSystems = function () {
  return this.http.get('/fs');
};

/**
 * Retrieves a document by its id
 * @param {string} id The id of the document
 * */
RavenClient.prototype.getDocument = function (id, params) {
  return this.http.get('/docs/' + id, params);
};

/**
 * Saves a document
 * @param {string} id The id of the document
 * @param {object} metadata The metadata of the document
 * @param {object} data The contents of the document
 * */
RavenClient.prototype.saveDocument = function (id, metadata, data, params) {
  return this.http.put('/docs/' + id, data, {
    'Raven-Entity-Name': metadata['Raven-Entity-Name'],
    'Raven-Clr-Type': metadata['Raven-Clr-Type'],
    'If-None-Match': metadata['@etag']
  }, params)
      .then(function (res) {
        this.$rootScope.$broadcast('raven:document:saved', id, metadata, data, res);
        return res;
      });
};

RavenClient.prototype.deleteDocument = function (id, params) {
  return this.http.del('/docs/' + id, params)
      .then(function (res) {
        this.$rootScope.$broadcast('raven:document:deleted', id, res);
        return res;
      });
};

RavenClient.prototype.deleteIndex = function (name, params) {
  return this.http.del('/indexes/' + name, params)
      .then(function (res) {
        this.$rootScope.$broadcast('raven:index:deleted', name, res);
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
RavenClient.prototype.getDocuments = function (params) {
  return this.http.get('/docs', params);
};

RavenClient.prototype.getAlerts = function (params) {
  return this.http.get('/docs/Raven/Alerts', params);
};

/**
 * Queries an index
 * @param {string} indexName
 * @param {(object|string)=} query
 * @param {(string|string[])=} params.sort Example: LastModified
 * @param {string=} params.operator Example: AND, OR
 * @param {string=} params.resultsTransformer
 * @param {string=} params.fetch Example: __all_fields
 * @param {string=} params.debug Example: entries
 * @param {string=} params.start
 * @param {string=} params.pageSize
 * */
RavenClient.prototype.queryIndex = function (indexName, query, params) {
  function buildQuery() {
    if (angular.isString(query)) return query;

    if (angular.isObject(query))
      return _.reduce(query,
          function (acc, val, key) {
            return acc + ' ' + key + ':' + val
          }, '').substr(1);
  }

  return this.http.get('/indexes/' + indexName, _.merge({ 'query': buildQuery() }, params));
};

/*
 * metadata-only true/false
 * */
RavenClient.prototype.queries = function (params) {
  return this.http.get('/queries', params);
};

/*
 field
 fromValue
 pageSize
 */
RavenClient.prototype.getTerms = function (indexName, params) {
  return this.http.get('/terms/' + indexName, params);
};

/*
 parallel: yes / no
 * */
RavenClient.prototype.multiGet = function (requests, parallel, params) {
  return this.http.post('/multi_get', requests, angular.extend({ parallel: parallel ? 'yes' : 'no' }, params));
};

RavenClient.prototype.debug = {
  init: function (http) {
    this.http = http;
  }
};

RavenClient.prototype.debug.getUserInfo = function (params) {
  return this.http.get('/debug/user-info', params);
};

RavenClient.prototype.debug.getMetrics = function (params) {
  return this.http.get('/debug/metrics', params);
};

RavenClient.prototype.debug.getConfig = function (params) {
  return this.http.get('/debug/config', params);
};

RavenClient.prototype.debug.getTasks = function (params) {
  return this.http.get('/debug/tasks', params);
};

RavenClient.prototype.debug.getQueries = function (params) {
  return this.http.get('/debug/queries');
};

RavenClient.prototype.debug.getChanges = function (params) {
  return this.http.get('/debug/changes');
};

RavenClient.prototype.debug.getCurrentlyIndexing = function (params) {
  return this.http.get('/debug/currently-indexing');
};

RavenClient.prototype.debug.getRoutes = function (params) {
  return this.http.get('/debug/routes');
};

RavenClient.prototype.debug.getRequestTracing = function (params) {
  return this.http.get('/debug/request-tracing');
};

RavenClient.prototype.debug.getSlowDocCounts = function (params) {
  return this.http.get('/debug/sl0w-d0c-c0unts');
};

RavenClient.prototype.debug.getIdentities = function (params) {
  return this.http.get('/debug/identities');
};

RavenClient.prototype.debug.getIndexingPerfStats = function (params) {
  return this.http.get('/debug/indexing-perf-stats');
};

RavenClient.prototype.debug.suggestIndexMerge = function (params) {
  return this.http.get('/debug/suggest-index-merge');
};

RavenClient.prototype.getLogs = function (params) {
  return this.http.get('/logs', params);
};

RavenClient.prototype.getRunningTasks = function (params) {
  return this.http.get('/operations');
};

/*
 * definition yes / no
 * */
RavenClient.prototype.getIndex = function (indexName, params) {
  return this.http.get('/indexes/' + indexName, params);
};

RavenClient.prototype.getTransformers = function (params) {
  return this.http.get('/transformers', params);
};

RavenClient.prototype.getTransformer = function (transformerName, params) {
  return this.http.get('/transformers/' + transformerName, params);
};

RavenClient.prototype.getBuildVersion = function (params) {
  return this.http.get('/build/version', params);
};

RavenClient.prototype.getLicenseStatus = function (params) {
  return this.http.get('/license/status', params);
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
RavenClient.prototype.createDatabase = function (databaseName, data, params) {
  return this.http.put('/admin/databases/' + databaseName, data, {}, params);
};

// v3 only?
RavenClient.prototype.getSingleAuthToken = function () {
  return this.http.get('/singleAuthToken');
};

/**
 * Gets the facets
 * @param {string} indexName The name of the index to query
 * @param {object[]} [params.facets] Example: [{"Name":"Tag"}]
 * */
RavenClient.prototype.getFacets = function (indexName, params) {
  if (params && params.facets) {
    params.facets = [params.facets];
  }

  return this.http.get('/facets/' + indexName, params);
};

RavenClient.prototype.getStats = function getStats(params) {
  return this.http.get('/stats', params)
};

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