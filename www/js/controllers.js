angular.module('corvus.controllers', [])

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
    })

    .controller('EditConnectionCtrl',
    function ($scope, $state, $q, $timeout, $stateParams, $ionicGesture, raven, Dialogs, Toast, Spinner, Connections, Store) {
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
        return ravenClient.getStats();
      }

      $scope.test = function () {
        Spinner.show();

        checkServerVersion()
            .then(function (serverVersion) {
              $scope.connection.serverVersion = serverVersion;
              return raven($scope.connection);
            })
            .then(function (ravenClient) {
              return ravenClient.debug.getUserInfo({ ignoreErrors: 404 })
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

    .controller('ListConnectionsCtrl',
    function ($scope, $state, $ionicPopover, $ionicModal, Connections, Settings, Toast) {
      $scope.connections = Connections.list();
      $scope.settings = Settings.get();

      $ionicPopover.fromTemplateUrl('templates/connections/listPopover.html', {
        scope: $scope
      }).then(function (popover) {
        $scope.popover = popover;
      });

      $ionicModal.fromTemplateUrl('templates/settingsModal.html', {
        scope: $scope
      }).then(function (modal) {
        $scope.settingsModal = modal;
      });

      $scope.showPopover = function (event) {
        $scope.popover.show(event);
      };

      $scope.showSettings = function () {
        $scope.popover.hide();
        $scope.settingsModal.show();
      };

      $scope.$on('$destroy', function () {
        $scope.popover.remove();
        $scope.settingsModal.remove();
      });

      $scope.saveSettings = function () {
        Settings.set($scope.settings);
        $scope.settingsModal.hide();
        Toast.showShortBottom('Settings saved');
      };

      $scope.edit = function (connection, event) {
        $state.go('connections.edit', { name: connection.name });
        event.preventDefault();
      };

      $scope.create = function () {
        $state.go('connections.edit');
      };

      $scope.selectConnection = function (connection) {
        if (connection.database) {
          $state.go('app.documents.user', { connectionName: connection.name, databaseName: connection.database });
        } else {
          $state.go('databases', { connectionName: connection.name })
        }
      };

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

    .controller('DocumentsSideMenuCtrl', function ($scope, ravenClient) {

      $scope.$on('raven:document:deleted', function (event, documentId, res) {
        updateDocumentCounts();
      });

      function updateDocumentCounts() {
        ravenClient.getStats().then(function (res) {
          $scope.totalDocuments = res.data.CountOfDocuments;
        });

        ravenClient.getFacets('Raven/DocumentsByEntityName', { facets: [{ Name: 'Tag' }] })
            .then(function (res) {
              $scope.entities = res.data.Results.Tag.Values.map(function (v) {
                return {
                  name: v.Range,
                  totalResults: v.Hits
                };
              });
            });
      }

      updateDocumentCounts();
    })

    .controller('DocumentsCtrl', function ($scope, system, $state, $stateParams, $ionicPopover, ravenClient) {
      var pageSize = 10;

      $scope.title = $stateParams.tag || (system ? 'System' : 'Documents');
      $scope.start = 0;
      $scope.documents = [];

      $scope.layoutModes = ['List', 'Small Cards', 'Medium Cards', 'Large Cards'];
      $scope.layout = { mode: $scope.layoutModes[0] };

      $scope.loadNextPage = function () {
        loadDocuments();
        $scope.start += pageSize;
      };

      $ionicPopover.fromTemplateUrl('templates/app/documents/documentsViewOptions.html', {
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
          return ravenClient.queryIndex('Raven/DocumentsByEntityName', { Tag: $stateParams.tag }, params)
              .then(function (res) {
                showDocuments(res.data.Results);
              }, noDocuments);
        }

        if (system) {
          angular.extend(params, { startsWith: 'Raven' });
        }

        ravenClient.getDocuments(params).then(function (res) {
          showDocuments(res.data);
        }, noDocuments);
      }
    })

    .controller('DocumentCtrl',
    function ($scope, $stateParams, $ionicNavBarDelegate, Toast, Dialogs, Spinner, ActionSheet, ravenClient, Settings) {
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
          addDestructiveButtonWithLabel: actions.remove
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

      function loadWholeDocument() {
        ravenClient.getDocument($stateParams.id, { ignoreErrors: 404 })
            .then(function (res) {
              var referencesRegex = new RegExp(Settings.get().documentIdPattern, 'g'),
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
      }

      $scope.remove = function () {
        Dialogs.confirm('Are you sure you want to delete this document?')
            .then(function (result) {
              if (result === 1) {
                Spinner.show();

                ravenClient.deleteDocument($scope.documentId)
                    .then(function (res) {
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
        Dialogs.confirm('Are you sure you want to save your changes?')
            .then(function (result) {
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
                        Dialogs.confirm('The document was changed on the server, reload?', 'Change conflict')
                            .then(function (buttonIndex) {
                              if (buttonIndex === 1) {
                                loadWholeDocument();
                              }
                            });
                      }
                    })
                    .finally(function () {
                      Spinner.hide();
                    });
              }
            });
      };

      loadWholeDocument();
    })

    .controller('IndexesSideMenuCtrl', function ($scope) {

    })
    .controller('IndexStatsCtrl', function ($scope, ravenClient, Dialogs, Toast, Spinner) {
      $scope.client = ravenClient;

      $scope.beforeValue = 1;
      $scope.beforeMeasure = 'week';

      function loadStats() {
        if (ravenClient.isV3()) {
          ravenClient.debug.suggestIndexMerge()
              .then(function (res) {
                $scope.unmergeables = res.data.Unmergables;
                $scope.suggestions = res.data.Suggestions;
                $scope.noUnmergeables = !Object.keys(res.data.Unmergables).length;
                $scope.noSuggestions = !Object.keys(res.data.Suggestions).length;
              });
        }

        ravenClient.getStats()
            .then(function (res) {
              $scope.indexes = res.data.Indexes;
            });
      }

      $scope.removeIndex = function (index) {
        Dialogs.confirm('Are you sure you want to delete this index?')
            .then(function (buttonIndex) {
              if (buttonIndex === 1) {
                Spinner.show();

                ravenClient.deleteIndex(index.Name)
                    .then(function (res) {
                      Toast.showShortCenter('Index ' + index.Name + ' deleted');
                      loadStats();
                    }).finally(function () {
                      Spinner.hide();
                    });
              }
            });
      };

      loadStats();
    })
    .controller('IndexesCtrl', function ($scope, ravenClient) {
      ravenClient.getStats().then(function (res) {
        $scope.indexesByEntityName = _.groupBy(res.data.Indexes, 'ForEntityName');
      })
    })
    .controller('TransformersCtrl', function ($scope, ravenClient) {
      ravenClient.getTransformers().then(function (res) {
        $scope.transformersByEntityName = _.groupBy(res.data, function (t) {
          return t.name.split('/')[0] || t.name;
        });
      });
    })
    .controller('TransformerCtrl', function ($scope, $stateParams, ravenClient) {
      $scope.name = $stateParams.name;

      ravenClient.getTransformer($stateParams.name).then(function (res) {
        $scope.transformer = res.data.Transformer;
      });
    })

    .controller('IndexCtrl', function ($scope, $stateParams, ravenClient) {
      $scope.name = $stateParams.name;

      ravenClient.getIndex($stateParams.name, { definition: 'yes' })
          .then(function (res) {
            $scope.index = res.data.Index;
          });
    })
    .controller('IndexSideMenuCtrl', function ($scope, $stateParams, ravenClient) {
      $scope.name = $stateParams.name;

      ravenClient.getIndex($stateParams.name, { definition: 'yes' })
          .then(function (res) {
            $scope.index = res.data.Index;
          });
    })
    .controller('IndexTermsCtrl', function ($scope, $stateParams, ravenClient) {
      $scope.name = $stateParams.name;

      ravenClient.getTerms($stateParams.name, { field: $stateParams.field })
          .then(function (res) {
            $scope.terms = res.data;
          });
    })
    .controller('IndexQueryCtrl', function ($scope, $state, $ionicModal, ravenClient, Dialogs, Queries) {
      var currentSortIndex,
          lastQuery = Queries.getLast(),
          pageSize = 10;

      $scope.start = 0;
      $scope.documents = [];

      ravenClient.getTransformers()
          .then(function (res) {
            $scope.transformers = res.data;
          });

      $scope.sorts = [];
      $scope.query = '';
      $scope.operator = 'OR';

      $scope.loadNextPage = function () {
        loadDocuments();
        $scope.start += pageSize;
      };

      if (lastQuery) {
        $scope.query = lastQuery.query;
        $scope.sorts = lastQuery.sortBy;
        $scope.transformer = lastQuery.transformer;
        $scope.operator = lastQuery.operator;
      }

      $scope.sortOrders = [
        { name: 'Ascending', ascending: true, range: false },
        { name: 'Descending', ascending: false, range: false },
        { name: 'Range Ascending', ascending: true, range: true },
        { name: 'Range Descending', ascending: false, range: true }
      ];

      $scope.operators = ['OR', 'AND'];

      $ionicModal.fromTemplateUrl('templates/app/indexes/querySortModal.html', {
        scope: $scope
      })
          .then(function (modal) {
            $scope.querySortModal = modal;
          });

      $ionicModal.fromTemplateUrl('templates/app/indexes/queryResultsModal.html', {
        scope: $scope
      }).then(function (modal) {
        $scope.queryResultsModal = modal;
      });

      $scope.runQuery = function () {
        Queries.save({
          indexName: $scope.name,
          query: $scope.query,
          sortBy: $scope.sorts,
          transformer: $scope.transformer,
          operator: $scope.operator
        });

        $scope.queryResultsModal.show();
        $scope.querying = true;
      };

      function noDocuments(res) {
        if (res.data.Error) {
          $scope.queryResultsModal.hide();
          Dialogs.alert(res.data.Error, 'Error');
        }

        showDocuments([]);
      }

      function showDocuments(docs) {
        $scope.noMoreDocs = !docs.length;
        $scope.documents.push.apply($scope.documents, docs);
        $scope.$broadcast('scroll.infiniteScrollComplete');
      }

      function loadDocuments() {
        var params = {
          ignoreErrors: 500,
          sort: $scope.sorts.map(function (sort) {
            return (!sort.order.ascending ? '-' : '') +
                sort.field +
                (sort.order.range ? '_Range' : '');
          }),
          resultsTransformer: $scope.transformer && $scope.transformer.name,
          operator: $scope.operator,
          start: $scope.start,
          pageSize: pageSize
        };

        ravenClient.queryIndex($scope.name, $scope.query, params)
            .then(function (res) {
              showDocuments(res.data.Results);
            }, noDocuments);
      }

      $scope.$on('$destroy', function () {
        $scope.querySortModal.remove();
        $scope.queryResultsModal.remove();
      });

      $scope.$on('modal.hidden', function () {
        currentSortIndex = null;
        $scope.start = 0;
        $scope.documents = [];
        $scope.currentSort = null;
        $scope.querying = false;
        $scope.noMoreDocs = false;
      });

      $scope.addSort = function () {
        $scope.currentSort = { order: $scope.sortOrders[0] };
        $scope.querySortModal.show();
      };

      $scope.editSort = function (index) {
        currentSortIndex = index;
        $scope.currentSort = angular.copy($scope.sorts[index]);
        $scope.querySortModal.show();
      };

      $scope.removeSort = function (index, event) {
        $scope.sorts.splice(index, 1);
        event.stopPropagation();
      };

      $scope.saveCurrentSort = function () {
        if (angular.isNumber(currentSortIndex)) {
          $scope.sorts.splice(currentSortIndex, 1, $scope.currentSort);
        } else {
          $scope.sorts.push($scope.currentSort);
        }

        $scope.querySortModal.hide();
      };
    })

    .controller('StatsCtrl', function ($scope, ravenClient) {
      ravenClient.getStats().then(function (res) {
        $scope.stats = res.data;
      });
    })
    .controller('UserInfoCtrl', function ($scope, ravenClient) {
      ravenClient.debug.getUserInfo().then(function (res) {
        $scope.userInfo = res.data;
      });
    });
