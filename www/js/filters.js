angular.module('corvus.filters', [])
    .filter('omitMetadata', function () {
      return function(items) {
        if(angular.isArray(items)) {
          return angular.map(items, function(item){
            return _.omit(item, '@metadata');
          });
        } else {
          return _.omit(items, '@metadata');
        }
      }
    });