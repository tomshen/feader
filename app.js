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

    models.article.hasOne('feed', models.feed);
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

function getFeed(url, callback) {
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
    res.send(500);
  }
}

app.get('/', function(req, res){
  res.render('index');
});

app.get('/feed', function(req, res) {
  getFeed(req.query.url, function(err, feed) {
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

app.post('/feed/new', function(req, res) {
  getFeed(req.body.url, function(err, feed) {
    handleError(err, res);
    var feedData = feed.meta;
    req.models.feed.find({ xmlurl: feedData.xmlurl }, function(err, feeds) {
      handleError(err, res);
      if(feeds.length > 0) {
        req.models.feed.get(feeds[0].id, function(err, sameFeed) {
          sameFeed.save(feedData, function(err) {
            handleError(err, res);
          });
        });
      } else {
        req.models.feed.create(feedData, function(err, item) {
          handleError(err, res);
        });
      }
    });
    res.send(200);
  });
});

app.post('/feed/:id/update', function(req, res) {
  req.models.feed.exists(req.params.id, function(err, exists) {
    if(err) res.send(error);
    if(!exists) res.send(404);
  });
  req.models.feed.get(req.params.id, function(err, feed) {
    handleError(err);
    if(!feed) res.send(404);
    getFeed(feed.xmlurl, function(err, feed) {
      handleError(err, res);
      _(feed.articles).each(function(element, index, list) {
        req.models.article.find({ guid: element.guid, link: element.link }, function(err, articles) {
          handleError(err, res);
          if(articles.length == 0) {
            var newArticle = new req.models.article(element);
            handleError(err, res);
            req.models.feed.get(req.params.id, function(err, feed) {
              handleError(err, res);
              newArticle.setFeed(feed, function(err) {
                handleError(err, res);
                newArticle.save(function(err) {
                  handleError(err, res);
                  res.send(feed);
                });
              });
            });
          }
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