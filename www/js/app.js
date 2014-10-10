angular.module('corvusApp',
    ['ionic', 'corvus.controllers', 'corvus.filters', 'corvus.services', 'corvus.directives', 'ngRaven', 'ngCordova'])

    .run(function ($ionicPlatform) {
      $ionicPlatform.ready(function () {
        // Hide the accessory bar by default (remove this to show the accessory bar above the keyboard
        // for form inputs)
        if (window.cordova && window.cordova.plugins.Keyboard) {
          cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
        }
        if (window.StatusBar) {
          // org.apache.cordova.statusbar required
          StatusBar.styleDefault();
        }
      });
    })

    .config(function ($stateProvider, $urlRouterProvider, ravenProvider) {
      /*ravenProvider.defaults.url = 'https://kiwi.ravenhq.com/databases/simoneb-test';
       ravenProvider.defaults.apiKey = '781ffb1c-a505-4485-8505-2f160d4820d2';*/

      ravenProvider.defaults.responseErrorHandlers.push(function ($q, Toast) {
        return function (res) {
          if ((res.config.ignoreErrors || []).indexOf(res.status) !== -1) {
            return $q.reject(res);
          }

          switch (res.status) {
            case 0:
              Toast.showShortBottom('Cannot contact server');
              break;
            case 400:
              Toast.showShortBottom('Server did not accept the request');
              break;
            case 401:
            case 403:
              Toast.showShortBottom('Operation unauthorized or forbidden');
              break;
            case 404:
              Toast.showShortBottom('The resource cannot be found');
              break;
            case 412:
              Toast.showShortBottom('Authorization problem, precondition failed')
              break;
            default:
              Toast.showShortBottom('Unknown server error (' + res.status + ')');
          }

          return $q.reject(res);
        }
      });

      $stateProvider

          .state('connections', {
            url: '/connections',
            abstract: true,
            templateUrl: 'templates/connections.html'
          })
          .state('connections.edit', {
            url: '/edit/*name',
            templateUrl: 'templates/connections/edit.html',
            controller: 'EditConnectionCtrl'
          })
          .state('connections.list', {
            url: '/list',
            templateUrl: 'templates/connections/list.html',
            controller: 'ListConnectionsCtrl'
          })

          .state('databases', {
            url: '/:connectionName/databases',
            templateUrl: 'templates/databases.html',
            controller: 'DatabasesCtrl',
            resolve: {
              ravenClient: function ($stateParams, Connections, raven) {
                return raven(Connections.get($stateParams.connectionName));
              }
            }
          })

          .state('app', {
            url: "/:connectionName/:databaseName",
            abstract: true,
            templateUrl: "templates/app.html",
            controller: 'AppCtrl',
            resolve: {
              connectionName: function ($stateParams) {
                return $stateParams.connectionName
              },
              databaseName: function ($stateParams) {
                return $stateParams.databaseName
              },
              ravenClient: function ($stateParams, raven, Connections) {
                var connection = Connections.get($stateParams.connectionName);

                return raven(angular.extend(connection, {
                  database: $stateParams.databaseName
                }));
              }
            }
          })
          .state('app.documents', {
            abstract: true,
            views: {
              menuContent: {
                templateUrl: 'templates/app/documents/documentsSideMenu.html',
                controller: 'DocumentsSideMenuCtrl'
              },
              mainContent: {
                template: '<ion-nav-view></ion-nav-view>'
              }
            }
          })
          .state('app.documents.user', {
            url: "/documents/*tag",
            templateUrl: 'templates/app/documents/documents.html',
            controller: 'DocumentsCtrl',
            resolve: {
              system: function () {
                return false;
              }
            }
          })
          .state('app.documents.system', {
            url: "/systemDocuments",
            templateUrl: 'templates/app/documents/documents.html',
            controller: 'DocumentsCtrl',
            resolve: {
              system: function () {
                return true;
              }
            }
          })
          .state('app.documents.document', {
            url: "/document/*id",
            templateUrl: "templates/app/documents/document.html",
            controller: 'DocumentCtrl'
          })

          .state('app.indexes', {
            url: '/indexes',
            abstract: true,
            views: {
              menuContent: {
                templateUrl: 'templates/app/indexes/indexesSideMenu.html',
                controller: 'IndexesSideMenuCtrl'
              },
              mainContent: {
                template: '<ion-nav-view></ion-nav-view>'
              }
            }
          })
          .state('app.indexes.stats', {
            url: '/stats',
            templateUrl: 'templates/app/indexes/stats.html',
            controller: 'IndexStatsCtrl'
          })
          .state('app.indexes.list', {
            url: '/list',
            templateUrl: 'templates/app/indexes/indexes.html',
            controller: 'IndexesCtrl'
          })
          .state('app.indexes.index', {
            url: '/index/*name',
            templateUrl: 'templates/app/indexes/index.html',
            controller: 'IndexCtrl'
          });

      $urlRouterProvider.otherwise('/connections/list');
    });

