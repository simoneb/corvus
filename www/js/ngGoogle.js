angular.module('ngGoogle', [])
    .provider('$google', function () {
      var config = {};

      return {
        initialize: function (clientId, scopes) {
          config.clientId = clientId;
          config.scope = scopes.join(' ');
        },
        $get: function ($window, $http, $q) {
          function authorize() {
            var authUrl = 'https://accounts.google.com/o/oauth2/auth?' + $.param({
                      client_id: config.clientId,
                      scope: config.scope,
                      redirect_uri: 'http://localhost',
                      response_type: 'code'
                    }),
                authWindow = $window.open(authUrl, '_blank', 'location=no,toolbar=no'),
                deferred = $q.defer();

            $(authWindow).on('loadstart', function (e) {
              var url = e.originalEvent.url;
              var code = /\?code=(.+)$/.exec(url);
              var error = /\?error=(.+)$/.exec(url);

              if (code || error) {
                authWindow.close();
              }

              if (code) {
                $http.post('https://accounts.google.com/o/oauth2/token', {
                  code: code[1],
                  client_id: config.clientId,
                  redirect_uri: 'http://localhost',
                  grant_type: 'authorization_code'
                }, {
                  headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                  },
                  transformRequest: function (obj) {
                    var str = [];
                    for (var p in obj)
                      str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
                    return str.join("&");
                  },
                }).success(function (data) {
                  console.log('successfully obtained authorization code', data);
                  deferred.resolve(data);
                }).error(function (data) {
                  deferred.reject(data);
                  console.log('error obtaining authorization code', data)
                });
              } else if (error) {
                deferred.reject(error[1]);
                console.log('error obtaining access code', error[1]);
              }
            });

            return deferred.promise;
          }

          function createConfig(config, auth) {
            return _.merge({
              headers: {
                Authorization: 'Bearer ' + auth.access_token
              }
            }, config || {})
          }

          return {
            get: function (url, config) {
              return authorize().then(function (auth) {
                return $http.get(url, createConfig(config, auth))
              })
            },
            post: function (url, data, config) {
              return authorize().then(function (auth) {
                return $http.post(url, data, createConfig(config, auth));
              });
            }
          }
        }
      }
    });