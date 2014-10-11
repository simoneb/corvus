angular.module('corvus.directives', [])
    .directive('uniqueConnection', function (Connections) {
      return {
        require: 'ngModel',
        link: function (scope, elm, attrs, ctrl) {
          ctrl.$parsers.unshift(function (viewValue) {
            var originalName = scope.$eval(attrs['uniqueConnection']);

            if (!originalName || originalName !== viewValue) {
              if (Connections.get(viewValue)) {
                ctrl.$setValidity('uniqueConnection', false);
                return undefined;
              } else {
                ctrl.$setValidity('uniqueConnection', true);
                return viewValue;
              }
            }
          });
        }
      }
    })
    .directive('regexp', function () {
      return {
        require: 'ngModel',
        link: function (scope, elm, attrs, ctrl) {
          ctrl.$parsers.unshift(function (viewValue) {
            try {
              new RegExp(viewValue);
              ctrl.$setValidity('regexp', true);
              return viewValue;
            } catch (err) {
              ctrl.$setValidity('regexp', false);
            }
          });
        }
      }
    })
    .directive('ifV3', function () {
      return {
        link: function (scope, elm, attrs) {
          var client = scope.$eval(attrs['ifV3']);
          if (!client) return;

          if (!client.isV3())
            angular.element(elm).remove();
        }
      };
    });