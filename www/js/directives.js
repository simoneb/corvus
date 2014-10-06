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
    });