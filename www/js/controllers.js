angular.module('corvus.controllers', [])

    .controller('EditConnectionCtrl',
    function ($scope, $state, $q, $timeout, $stateParams, $ionicGesture, raven, Dialogs, Toast, Spinner, Connections) {
      var name = $stateParams.name,
          formElement = angular.element(document.getElementById('connectionForm'));

      $scope.originalName = name;
      $scope.create = !name;
      $scope.formHolder = {};

      if (name) {
        $scope.connection = Connections.get(name);
        $scope.titlePrefix = 'Edit';
        $scope.buttonPrefix = 'Save';
      } else {
        $scope.connection = { authenticationType: '' };
        $scope.buttonPrefix = $scope.titlePrefix = 'Create';
      }

      function checkServerVersion() {
        return raven($scope.connection).getBuildVersion()
            .then(function (res) {
              return res.data.BuildVersion;
            });
      }

      function checkPurchase(ravenClient) {
        return ravenClient.getStats()
            .then(function (res) {
              if (res.data.CountOfDocuments > 2000) {
                return Toast.showLongCenter('Your target server or database contains more than 2000 documents. ' +
                'There will be a limit to the number of documents you can access for free, for now just enjoy!');
              }
            });
      }

      $scope.test = function () {
        Spinner.show();

        checkServerVersion()
            .then(function (serverVersion) {
              $scope.connection.serverVersion = serverVersion;
              return raven($scope.connection);
            })
            .then(function (ravenClient) {
              return ravenClient.getUser({ ignoreErrors: 404 })
                  .then(function () {
                    return checkPurchase(ravenClient);
                  }, function (res) {
                    if (res.status === 404)
                      Toast.showShortBottom('Wrong url or database name (status 404)');

                    return $q.reject(res);
                  })
                  .then(function () {
                    Toast.showShortCenter('Everything alright!');
                  });
            })
            .finally(function () {
              Spinner.hide();
            });
      };

      $scope.save = function () {
        Spinner.show();

        checkServerVersion()
            .then(function (serverVersion) {
              $scope.connection.serverVersion = serverVersion;
              return raven($scope.connection);
            })
            .then(checkPurchase)
            .then(function () {
              Connections.save($scope.connection, name);
              $state.go('connections.list');
            })
            .finally(function () {
              Spinner.hide();
            });
      };

      $scope.remove = function () {
        Dialogs.confirm('Are you sure you want to delete this connection?')
            .then(function (result) {
              if (result === 1) {
                Connections.remove(name);
                Toast.showShortCenter('Connection ' + name + ' deleted').finally(function () {
                  $state.go('connections.list');
                });
              }
            });
      };

      $ionicGesture.on('swiperight', function () {
        $scope.rightSwipe = true;

        $timeout(function () {
          $scope.rightSwipe = false;
        }, 500);
      }, formElement);

      $ionicGesture.on('swipeleft', function () {
        if ($scope.rightSwipe) {
          $scope.connection = Connections.getDefaultConnection();
          $scope.rightSwipe = false;
        }
      }, formElement);
    })

    .controller('ListConnectionsCtrl', function ($scope, $state, Connections) {
      $scope.connections = Connections.list();

      $scope.edit = function (connection, event) {
        $state.go('connections.edit', { name: connection.name });
        event.preventDefault();
      };

      $scope.create = function () {
        $state.go('connections.edit');
      };

      $scope.selectConnection = function (connection) {
        if (connection.database) {
          $state.go('app.documents', { connectionName: connection.name, databaseName: connection.database });
        } else {
          $state.go('databases', { connectionName: connection.name })
        }
      }

      $scope.isV3 = function (connection) {
        return /^3/.test(connection.serverVersion);
      };
    })

    .controller('DatabasesCtrl', function ($scope, $stateParams, Toast, ravenClient) {
      $scope.connectionName = $stateParams.connectionName;

      ravenClient.getDatabases().then(function (res) {
        $scope.databases = res.data;
      });
    })

    .controller('AppCtrl', function ($scope, $state, connectionName, databaseName, ravenClient, Connections) {
      $scope.connectionName = connectionName;
      $scope.databaseName = databaseName;
      $scope.singleDatabase = !!Connections.get(connectionName).database;

      $scope.changeConnection = function () {
        $state.go('connections.list');
      };

      $scope.changeDatabase = function () {
        if ($scope.singleDatabase) return;

        $state.go('databases', { connectionName: connectionName });
      };

      ravenClient.getStats().then(function (res) {
        $scope.totalDocuments = res.data.CountOfDocuments;
      });

      ravenClient.getTerms('Raven/DocumentsByEntityName', { field: 'Tag' })
          .then(function (res) {
            $scope.entities = res.data.map(function (coll) {
              return {
                name: coll,
                totalResults: ''
              }
            });

            ravenClient.multiGet(res.data.map(function (coll) {
              return {
                Query: '&query=Tag:' + coll,
                Url: '/indexes/Raven/DocumentsByEntityName'
              }
            })).then(function (res) {
              res.data.forEach(function (data, index) {
                $scope.entities[index].totalResults = data.Result.TotalResults
              });
            })
          });
    })

    .controller('DocumentsCtrl', function ($scope, $state, $stateParams, $ionicPopover, ravenClient) {
      var pageSize = 10;

      $scope.title = $stateParams.tag || 'Documents';
      $scope.start = 0;
      $scope.documents = [];

      $scope.layoutModes = ['List', 'Small Cards', 'Medium Cards', 'Large Cards'];
      $scope.layout = { mode: $scope.layoutModes[0] };

      $scope.loadNextPage = function () {
        loadDocuments();
        $scope.start += pageSize;
      };

      $ionicPopover.fromTemplateUrl('templates/app/documentsViewOptions.html', {
        scope: $scope
      }).then(function (popover) {
        $scope.popover = popover;
      });

      $scope.openPopover = function ($event) {
        $scope.popover.show($event);
      };

      $scope.closePopover = function () {
        $scope.popover.hide();
      };

      $scope.$on('$destroy', function () {
        if ($scope.popover) $scope.popover.remove();
      });

      function noDocuments() {
        showDocuments([]);
      }

      function showDocuments(docs) {
        $scope.noMoreDocs = !docs.length;
        $scope.documents.push.apply($scope.documents, docs);
        $scope.$broadcast('scroll.infiniteScrollComplete');
      }

      function loadDocuments() {
        var params = { start: $scope.start, pageSize: pageSize };

        if ($stateParams.tag) {
          ravenClient.queryIndex('Raven/DocumentsByEntityName', { Tag: $stateParams.tag }, params)
              .then(function (res) {
                showDocuments(res.data.Results);
              }, noDocuments);
        } else {
          ravenClient.getDocuments(params).then(function (res) {
            showDocuments(res.data);
          }, noDocuments);
        }
      }
    })

    .controller('DocumentCtrl',
    function ($scope, $stateParams, $ionicNavBarDelegate, Toast, Dialogs, Spinner, ActionSheet, ravenClient) {
      $scope.documentId = $stateParams.id;
      $scope.editable = false;
      $scope.hasChanged = false;

      var actions = {
        save: 'Save document',
        edit: 'Edit document',
        undo: 'Undo changes',
        remove: 'Delete document',
        cancel: 'Cancel'
      };

      $scope.openActionSheet = function () {
        var allowedActions = [];

        if ($scope.hasChanged) {
          allowedActions.push(actions.save);
        }

        if (!$scope.editable) {
          allowedActions.push(actions.edit);
        } else {
          allowedActions.push(actions.undo);
        }

        return ActionSheet.show({
          title: 'Choose action',
          buttonLabels: allowedActions,
          addCancelButtonWithLabel: actions.cancel,
          addDestructiveButtonWithLabel: actions.remove,
          androidEnableCancelButton: true
        }).then(function (buttonLabel) {
          switch (buttonLabel) {
            case actions.remove:
              $scope.remove();
              break;
            case actions.save:
              $scope.save();
              break;
            case actions.edit:
              $scope.edit();
              break;
            case actions.undo:
              $scope.undo();
              break;
          }
        });
      };

      ravenClient.getDocument($stateParams.id, { ignoreErrors: 404 })
          .then(function (res) {
            var referencesRegex = /:\s?"(\w+\/\d+)"/g,
                references = [],
                data = angular.toJson(res.data),
                match;

            do {
              match = referencesRegex.exec(data);
              if (match) references.push(match[1]);
            } while (match);

            $scope.document = res.data;
            $scope.jsonDocument = { value: angular.toJson(res.data, true) };
            $scope.references = references;

            $scope.$watch('jsonDocument.value', function (newVal) {
              $scope.numberOfLines = newVal.split('\n').length * 1.5;
            });
          }, function (res) {
            if (res.status === 404) {
              Toast.showShortBottom('This document does not exist').finally(function () {
                $ionicNavBarDelegate.back();
              });
            }
          });

      ravenClient
          .queries({ 'metadata-only': true, id: $scope.documentId })
          .then(function (res) {
            var result = res.data.Results[0];
            $scope.metadata = result && result['@metadata'];
          });

      $scope.remove = function () {
        Dialogs.confirm('Are you sure you want to delete this document?')
            .then(function (result) {
              if (result === 1) {
                Spinner.show();

                ravenClient.deleteDocument($scope.documentId)
                    .then(function () {
                      Toast.showShortCenter('Document ' + $scope.documentId + ' deleted')
                          .finally(function () {
                            $ionicNavBarDelegate.back();
                          });
                    }).finally(function () {
                      Spinner.hide();
                    });
              }
            });
      };

      $scope.changed = function () {
        $scope.hasChanged = true;
      };

      $scope.edit = function () {
        $scope.editable = true;
      };

      $scope.undo = function () {
        $scope.jsonDocument.value = angular.toJson($scope.document, true);
        $scope.hasChanged = false;
        $scope.editable = false;
      };

      $scope.save = function () {
        Dialogs.confirm('Are you sure you want to save your changes?').then(function (result) {
          if (result === 1) {
            Spinner.show();
            ravenClient.saveDocument($scope.documentId,
                $scope.metadata,
                angular.fromJson($scope.jsonDocument.value), { ignoreErrors: 409 })
                .then(function () {
                  Toast.showShortCenter('Document ' + $scope.documentId + ' updated');
                  $scope.editable = false;
                  $scope.hasChanged = false;
                }, function (res) {
                  if (res.status === 409) {
                    Toast.showShortBottom('The document was changed on the server, please reload');
                  }
                })
                .finally(function () {
                  Spinner.hide();
                });
          }
        });
      };
    });
