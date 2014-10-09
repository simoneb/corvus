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
    })
    .filter('indexNotUsedBefore', function() {
      return function(items, beforeAmount, beforeMeasure) {
        if(!angular.isArray(items)) return;

        return items.filter(function(index) {
          var lastQueryTimestamp = moment(index.LastQueryTimestamp);
          var lowerBound = moment().subtract(beforeAmount, beforeMeasure);

          return lastQueryTimestamp.isBefore(lowerBound);
        });
      }
    })
    .filter('fromNow', function() {
      return function(value) {
        return moment(value).fromNow();
      }
    });