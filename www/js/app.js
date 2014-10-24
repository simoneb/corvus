LE.init({
  token: '6f2f77f7-19ed-489d-a3bb-a6c5f4be4a99',
  print: true,
  catchall: true
});

window.ionic.Platform.ready(function () {
  angular.bootstrap(document, ['corvusApp']);
});

angular.module('corvusApp',
    ['ionic', 'corvus.controllers', 'corvus.filters', 'corvus.services', 'corvus.directives', 'ngRaven', 'ngCordova'])

    .config(function ($stateProvider, $urlRouterProvider, ravenProvider) {
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
          .state('app.indexes.transformers', {
            url: '/transformers',
            templateUrl: 'templates/app/indexes/transformers.html',
            controller: 'TransformersCtrl'
          })
          .state('app.indexes.transformer', {
            url: '/transformer/*name',
            templateUrl: 'templates/app/indexes/transformer.html',
            controller: 'TransformerCtrl'
          })

          .state('app.index', {
            abstract: true,
            url: '/index/*name',
            views: {
              menuContent: {
                templateUrl: 'templates/app/indexes/indexSideMenu.html',
                controller: 'IndexSideMenuCtrl'
              },
              mainContent: {
                template: '<ion-nav-view></ion-nav-view>',
                controller: 'IndexCtrl'
              }
            }
          })
          .state('app.index.definition', {
            url: '/definition',
            templateUrl: 'templates/app/indexes/indexDefinition.html'
          })
          .state('app.index.fields', {
            url: '/terms',
            templateUrl: 'templates/app/indexes/indexFields.html'
          })
          .state('app.index.terms', {
            url: '/terms/:field',
            templateUrl: 'templates/app/indexes/indexTerms.html',
            controller: 'IndexTermsCtrl'
          })
          .state('app.index.query', {
            url: '/query',
            templateUrl: 'templates/app/indexes/query.html',
            controller: 'IndexQueryCtrl'
          })

          .state('app.statuses', {
            url: '/statuses',
            views: {
              menuContent: {
                templateUrl: 'templates/app/documents/documentsSideMenu.html',
                controller: 'DocumentsSideMenuCtrl'
              },
              mainContent: {
                templateUrl: 'templates/app/statuses.html'
              }
            }
          })
          .state('app.status', {
            abstract: true,
            url: '/status',
            views: {
              menuContent: {
                templateUrl: 'templates/app/statusesSideMenu.html'
              },
              mainContent: {
                template: '<ion-nav-view></ion-nav-view>'
              }
            }
          })
          .state('app.status.stats', {
            url: '/stats',
            templateUrl: 'templates/app/stats.html',
            controller: 'StatsCtrl'
          })
          .state('app.status.userInfo', {
            url: '/userInfo',
            templateUrl: 'templates/app/userInfo.html',
            controller: 'UserInfoCtrl'
          });

      $urlRouterProvider.otherwise('/connections/list');
    })

    .run(function ($ionicPlatform, $timeout) {
      $ionicPlatform.ready(function () {
        if (window.cordova && window.cordova.plugins && window.cordova.plugins.Keyboard) {
          cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
        }
        if (window.StatusBar) {
          StatusBar.styleDefault();
        }

        $timeout(function () {
          window.navigator && window.navigator.splashscreen && window.navigator.splashscreen.hide();
        }, 1000);
      });
    })

    .run(function checkPurchasesOnGetStats($rootScope, $q, Dialogs, Store, Toast, MaxNumberOfFreeDocuments) {
      var originalGetStats = RavenClient.prototype.getStats;

      function doPurchase() {
        return Store.buyUnlimitedDocuments().then(function () {
          return Toast.showShortBottom('Document number limit removed, thanks for your support!');
        }, function (err) {
          LE.warn('Purchase failed', err);

          if (/-1005/.test(err)) {
            Toast.showShortBottom('Purchase canceled');
          } else {
            Toast.showShortBottom('Purchase failed');
          }

          return $q.reject(err);
        });
      }

      function checkPurchases(getStatsRes) {
        var documentCount = getStatsRes.data.CountOfDocuments;

        if (documentCount <= MaxNumberOfFreeDocuments) {
          return getStatsRes;
        }

        LE.log('Dealing with more than free allowed doc limit:', documentCount);

        return Store.hasUnlimitedDocuments().then(function (purchase) {
          LE.log('Unlimited number of documents purchase', purchase);

          if (!purchase) {
            return Dialogs.confirm('Your database contains more documents than you can access for free.\n\n' +
            'Do you want to support the development by purchasing a license?', 'Purchase required')
                .then(function (buttonIndex) {
                  switch (buttonIndex) {
                    case 1:
                      return doPurchase().then(function () {
                        return getStatsRes;
                      });
                    default :
                      return $q.reject();
                  }
                }, function () {
                  return $q.reject();
                });
          }
        }, function (err) {
          LE.warn('Cannot check purchase', err);

          Toast.showLongCenter('Too many documents but we can\'t check your purchases now');
          return $q.reject(err);
        });
      }

      RavenClient.prototype.getStats = function () {
        return originalGetStats.apply(this, Array.prototype.slice.call(arguments)).then(checkPurchases);
      };
    });