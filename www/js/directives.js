angular.module('corvus.directives', [])
    .directive('uniqueConnection', function (Connections) {
      return {
        require: 'ngModel',
        link: function (scope, elm, attrs, ctrl) {
          var check = scope[attrs['uniqueConnection']];

          if (check) {
            ctrl.$parsers.unshift(function (viewValue) {
              if (Connections.get(viewValue)) {
                ctrl.$setValidity('uniqueConnection', false);
                return undefined;
              } else {
                ctrl.$setValidity('uniqueConnection', true);
                return viewValue;
              }
            });
          }
        }
      }
    });