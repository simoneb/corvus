angular.module('corvus.services', [])
    .factory('Auth', function ($window, Connections) {
      return {
        isAuthenticated: function () {
          return false;
        },
        hasConnections: function () {
          return Connections.any();
        }
      }
    })
    .service('Connections', function ($window) {
      var self = this,
          store = $window.localStorage;

      function findIndex(name) {
        var list = self.list(),
            index;

        list.filter(function (c, i) {
          if (name === c.name) {
            index = i;
          }
        });

        return index;
      }

      self.get = function (name) {
        return self.list().filter(function (c) {
          return name === c.name
        })[0];
      };

      self.any = function () {
        return !!self.list().length;
      };

      self.list = function () {
        var item = store.getItem('connections');
        return item && angular.fromJson(item) || [];
      };

      self.save = function (connection, oldName) {
        var index = findIndex(oldName || connection.name);
        var list = self.list(),
            insertIndex = index >= 0 ? index : list.length;

        list[insertIndex] = connection;

        store.setItem('connections', angular.toJson(list));
      };

      self.remove = function (connectionOrName) {
        var name = connectionOrName.name || connectionOrName,
            list = self.list(),
            removeIndex = findIndex(name);

        if (removeIndex >= 0) {
          list.splice(removeIndex, 1);
          store.setItem('connections', angular.toJson(list));
        }
      };
    })
    .factory('Dialogs', function ($cordovaDialogs, $ionicPopup) {
      if (navigator.notification) {
        return $cordovaDialogs;
      } else {
        return {
          alert: function (message, title, buttonName, ionicOptions) {
            return $ionicPopup.alert(angular.extend({
              title: title,
              template: message,
              okText: buttonName
            }, ionicOptions));
          },
          confirm: function (message, title, buttonLabels, ionicOptions) {
            var customOptions = {};

            if (buttonLabels && buttonLabels[0]) {
              customOptions.okText = buttonLabels[0];
            }
            if (buttonLabels && buttonLabels[1]) {
              customOptions.cancelText = buttonLabels[1];
            }

            return $ionicPopup
                .confirm(angular.extend({
                  title: title,
                  template: message
                }, customOptions, ionicOptions))
                .then(function (ok) {
                  return ok ? 1 : 2;
                });
          },
          prompt: function (message, title, buttonLabels, defaultText, ionicOptions) {
            var customOptions = {};

            if (buttonLabels && buttonLabels[0]) {
              customOptions.okText = buttonLabels[0];
            }
            if (buttonLabels && buttonLabels[1]) {
              customOptions.cancelText = buttonLabels[1];
            }

            return $ionicPopup
                .prompt(angular.extend({
                  title: title,
                  template: message,
                  inputPlaceholder: defaultText
                }, customOptions, ionicOptions))
                .then(function (result) {
                  return { buttonIndex: result ? 1 : 2, input1: result };
                });
          },
          beep: angular.identity
        };
      }
    })
    .factory('Toast', function ($cordovaToast, $window, $timeout, $ionicPopup) {
      if ($window.plugins && $window.plugins.toast) {
        return $cordovaToast;
      } else {
        var result = {
          showShortTop: function (message) {
            return result.show(message, 'short');
          },
          showShortCenter: function (message) {
            return result.show(message, 'short');
          },
          showShortBottom: function (message) {
            return result.show(message, 'short');
          },
          showLongTop: function (message) {
            return result.show(message, 'long');
          },
          showLongCenter: function (message) {
            return result.show(message, 'long');
          },
          showLongBottom: function (message) {
            return result.show(message, 'long');
          },
          show: function (message, duration, position) {
            var alert = $ionicPopup.alert({ template: message });

            $timeout(function () {
              alert.close();
            }, duration === 'short' ? 2000 : 4000);

            return alert;
          }
        };

        return result;
      }
    })
    .factory('Spinner', function ($cordovaSpinnerDialog, $window, $ionicLoading) {
      if ($window.plugins && $window.plugins.spinnerDialog) {
        return $window.plugins.spinnerDialog;
      } else {
        return {
          show: function (title, message) {
            $ionicLoading.show(message);
          },
          hide: function () {
            $ionicLoading.hide();
          }
        };
      }
    });
