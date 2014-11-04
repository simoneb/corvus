angular.module('ngGoogle', [])
    .provider('$google', function () {
      var config = {},
      // this url does not matter in cordova, while it needs to be the same origin on desktop
          redirectUrl = 'http://localhost:8100';

      return {
        initialize: function (clientId, scopes) {
          config.clientId = clientId;
          config.scope = scopes.join(' ');
        },
        $get: function ($window, $http, $q, $interval) {
          var isCordova = !/http/.test($window.location.protocol),
              prefix = isCordova ? '' : 'http://cors.maxogden.com/';

          function requestAccessToken(authorizationCode) {
            return $http.post(prefix + 'https://accounts.google.com/o/oauth2/token', {
              code: authorizationCode,
              client_id: config.clientId,
              redirect_uri: redirectUrl,
              grant_type: 'authorization_code'
            }, {
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              transformRequest: function (obj) {
                var str = [];
                for (var p in obj)
                  str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
                return str.join("&");
              }
            });
          }

          function handleBrowserAuthorization(authWindow) {
            var deferred = $q.defer(),
                intervalClear = $interval(function () {
                  var url;

                  try {
                    url = authWindow.location.href;
                  } catch (err) {
                    return;
                  }

                  var code = /\?code=([^#]+)/.exec(url),
                      error = /\?error=([^#]+)/.exec(url);

                  if (code || error) {
                    authWindow.close();
                    $interval.cancel(intervalClear);
                  }

                  if (code) {
                    deferred.resolve(requestAccessToken(code[1]));
                  } else if (error) {
                    deferred.reject(error[1]);
                  }
                }, 1000);

            return deferred.promise;
          }

          function handleCordovaAuthorization(authWindow) {
            var deferred = $q.defer();

            $(authWindow).on('loadstart', function (e) {
              var url = e.originalEvent.url;
              var code = /\?code=(.+)$/.exec(url);
              var error = /\?error=(.+)$/.exec(url);

              if (code || error) {
                authWindow.close();
              }

              if (code) {
                deferred.resolve(requestAccessToken(code[1]));
              } else if (error) {
                return deferred.reject(error[1]);
              }
            });

            return deferred.promise;
          }

          function authorize() {
            var authUrl = 'https://accounts.google.com/o/oauth2/auth?' + $.param({
                      client_id: config.clientId,
                      scope: config.scope,
                      redirect_uri: redirectUrl,
                      response_type: 'code'
                    }),
                authWindow = $window.open(authUrl, '_blank', 'location=no,toolbar=no');

            if (isCordova) {
              return handleCordovaAuthorization(authWindow);
            } else {
              return handleBrowserAuthorization(authWindow);
            }
          }

          function createConfig(config, authRes) {
            return _.merge({
              headers: { Authorization: 'Bearer ' + authRes.data.access_token }
            }, config || {})
          }

          return {
            get: function (url, config) {
              return authorize().then(function (authRes) {
                return $http.get(url, createConfig(config, authRes))
              });
            },
            post: function (url, data, config) {
              return authorize().then(function (authRes) {
                return $http.post(url, data, createConfig(config, authRes));
              });
            }
          }
        }
      }
    });