var express = require('express'),
    request = require('request'),
    feedparser = require('feedparser'),
    cons = require('consolidate'),
    path = require('path'),
    http = require('http'),
    orm = require('orm');

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
      title: String,
      description: String,
      link: String,
      xmlurl: String,
      date: Date,
      pubdate: Date,
      author: String,
      language: String,
      favicon: String,
      copyright: String
    });

    models.article = db.define('article', {
      title: String,
      description: String,
      link: String,
      date: Date,
      pubdate: Date,
      author: String,
      guid: String
    });

    models.account = db.define('account', {
      username: { type: 'text', required: true },
      password: { type: 'text', required: true },
      firstname: String,
      lastname: String,
      email: String
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
      if(item) {
        data.articles.push(item);
        if(data.articles.length === 10)
          callback(err, data);
      } else callback(err, data);
      
    });
}

app.get('/', function(req, res){
  res.render('index');
});

app.get('/feed', function(req, res){
  getFeed(req.query.url, function(err, feed) {
    if(err) res.send(err);
    else res.render('feed', feed);
  });
});

app.get('/feed/new', function(req, res){
  getFeed(req.query.url, function(err, feed) {
    if(err) res.send(err);
    else {
      var feedData = feed.meta;
      var articleDataArray = feed.articles;
      req.models.feed.find({ xmlurl: feedData.xmlurl }, function(err, feeds) {
        if(err) res.send(err);
        else if(feeds.length > 0) {
          req.models.feed.get(feeds[0].id, function(err, sameFeed) {
            sameFeed.save(feedData, function(err) {
              if(err) res.send(err);
              else res.render('feed', feed);
            });
          });
        } else {
          req.models.feed.create(feedData, function(err, items) {
            if(err) res.send(err);
            else res.render('feed', feed);
          });
        }
      });
    }
  });
});

app.listen(port, function() {
  console.log('Listening on ' + port);
});