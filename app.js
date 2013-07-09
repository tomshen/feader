var express = require('express'),
    request = require('request'),
    feedparser = require('feedparser'),
    cons = require('consolidate'),
    path = require('path'),
    http = require('http'),
    orm = require('orm'),
    _ = require('underscore');

var config = require('./config');

var app = express();
var port = config.port;
var databaseURL = config.databaseURL;

app.use(express.logger());

// assign the swig engine to .html files
app.engine('html', cons.swig);

// set .html as the default extension
app.set('view engine', 'html');
app.set('views', __dirname + '/views');

app.configure(function () {
  app.set('view options', { layout: false });
  app.use(express.bodyParser());
  app.use('/static', express.static(path.join(__dirname, 'static')));
});

app.use(orm.express(databaseURL, {
  define: function (db, models) {
    models.feed = db.define('feed', {
      title: { type:'text', size: 4096 },
      description: { type:'text', size: 4096 },
      link: { type:'text', size: 4096 },
      xmlurl: { type:'text', size: 4096 },
      date: Date,
      pubdate: Date,
      author: { type:'text', size: 4096 },
      language: { type:'text', size: 4096 },
      favicon: { type:'text', size: 4096 },
      copyright: { type:'text', size: 4096 }
    });

    models.article = db.define('article', {
      title: { type:'text', size: 4096 },
      description: { type:'text', size: 4096 },
      link: { type:'text', size: 4096 },
      date: Date,
      pubdate: Date,
      author: { type:'text', size: 4096 },
      guid: { type:'text', size: 4096 }
    });

    models.account = db.define('account', {
      username: { type: 'text', required: true },
      password: { type: 'text', required: true },
      firstname: { type:'text', size: 4096 },
      lastname: { type:'text', size: 4096 },
      email: { type:'text', size: 4096 }
      // TODO: add more account config options
    });

    models.article.hasOne('feed', models.feed, { reverse: 'articles'} );
    models.account.hasMany('feeds', models.feed, {
      subdate: Date
    }, { reverse: 'accounts' });
     models.account.hasMany('articles', models.article, {
      read: Boolean,
      starred: Boolean,
      readdate: Date
    }, { reverse: 'accounts' });

    db.sync();
  }
}));

function getFeedData(url, callback) {
  var data = {
    meta: null,
    articles: []
  };
  var err;
  request(url)
    .pipe(new feedparser({
      addmeta: false
    }))
    .on('error', function(error) {
      err = error;
    })
    .on('meta', function (meta) {
      data.meta = meta;
    })
    .on('readable', function () {
      var item = this.read();
      if(item) data.articles.push(item);
    })
    .on('end', function() {
      callback(err, { meta: data.meta, articles: data.articles.slice(0, 10) });
    });
}

function handleError(err, res) {
  if(err) {
    console.error(err);
    res.send(404);
  }
}

app.get('/', function(req, res){
  res.render('index');
});

app.get('/feed', function(req, res) {
  getFeedData(req.query.url, function(err, feed) {
    handleError(err, res);
    res.render('feed', feed);
  });
});

app.get('/feed/:id', function(req, res) {
  req.models.feed.get(req.params.id, function(err, feed) {
    handleError(err, res);
    if(feed) res.send(feed);
    else res.send(404);
  });
});

app.get('/feed/:id/articles', function(req, res) {
  req.models.feed.get(req.params.id, function(err, feed) {
    handleError(err, res);
    if(feed) feed.getArticles(function(err, articles) {
      handleError(err, res);
      res.send(articles);
    });
    else res.send(404);
  });
});

function createOrUpdateFeed(Models, data, callback) {
  var feedData = data.meta;
  Models.feed.find({ xmlurl: feedData.xmlurl }, function(err, feeds) {
    if(err) callback(err);
    if(feeds.length > 0) {
      Models.feed.get(feeds[0].id, function(err, sameFeed) {
        sameFeed.save(feedData, function(err) {
          if(err) callback(err);
        });
        callback(null);
      });
    } else {
      var feed = new Models.feed(feedData);
      feed.save(function(err) {
        if(err) callback(err);
      });
      callback(null);
    }
  });
}

function createOrUpdateArticles(Models, articles, feedId, callback) {
  var articlesProcessed = 0;
  _(articles).each(function(element, index, list) {
    Models.article.find({ guid: element.guid, link: element.link }, function(err, articles) {
      if(err) callback(err);
      if(articles.length == 0) {
        var newArticle = new Models.article(element);
        if(err) callback(err);
        Models.feed.get(feedId, function(err, feed) {
          if(err) callback(err);
          newArticle.setFeed(feed, function(err) {
            if(err) callback(err);
            newArticle.save(function(err) {
              if(err) callback(err);
              if(++articlesProcessed >= articles.length)
                callback(null);
            });
          });
        });
      }
      else if(++articlesProcessed >= articles.length)
        callback(null);
    });
  });
}

app.post('/feed/new', function(req, res) {
  getFeedData(req.body.url, function(err, data) {
    handleError(err, res);
    createOrUpdateFeed(req.models, data, function(err) {
      handleError(err, res);
      res.send(200);
    });
  });
});

app.post('/feed/:id/update', function(req, res) {
  req.models.feed.exists(req.params.id, function(err, exists) {
    handleError(err, res);
    if(!exists) res.send(404);
  });
  req.models.feed.get(req.params.id, function(err, feed) {
    handleError(err, res);
    if(!feed) {
      res.send(404);
    }
    getFeedData(feed.xmlurl, function(err, data) {
      handleError(err, res);
      createOrUpdateFeed(req.models, data, function(err) {
        handleError(err, res);
        createOrUpdateArticles(req.models, data.articles, req.params.id, function(err) {
          handleError(err, res);
          feed.getArticles(function(err, articles) {
            handleError(err, res);
            res.send({
              feed: feed,
              articles: articles
            });
          });
        });
      });
    });
  });
});

app.get('/feed/:feedId/article/:articleId', function(req, res) {
  req.models.feed.get(req.params.feedId, function(err, feed) {
    handleError(err, res);
    if(feed) {
      req.models.article.get(req.params.articleId, function(err, article) {
        handleError(err, res);
        if(article) article.getFeed(function(err, articleFeed) {
          handleError(err, res);
          if(articleFeed && articleFeed.id == feed.id) {
            article.description = JSON.stringify(article.description);
            res.send(article);
          }
        });
        else res.send(404);
      });
    } else res.send(404);
  });
});

app.listen(port, function() {
  console.log('Listening on ' + port);
});