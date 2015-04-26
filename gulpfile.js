// shelljs 是 Node.js 实现的一套常见的 shell 命令
// 这里是全局引入。
// 作者这里用于发布 gh-pages. 替代办法可以用 gulp-gh-pages
require('shelljs/global');

// 模块引入，作者是按字母顺序排列

// 在 gulp 中使用命令行选项
var argv = require('yargs').argv;
// ES6 Object.assign
var assign = require('object-assign');
// Babel browserify transform
var babelify = require('babelify');
var browserify = require('browserify');
// 让 vinyl 文件支持 stream
var buffer = require('vinyl-buffer');
// 与 serveStatic 搭建静态服务器
var connect = require('connect');
// postcss 插件
var cssnext = require('gulp-cssnext');
var del = require('del');
// markdown front matter parser
var frontMatter = require('front-matter');
var gulp = require('gulp');
var gulpIf = require('gulp-if');
var gutil = require('gulp-util');
// HTML entity encoder/decoder
var he = require('he');
var hljs = require('highlight.js');
var htmlmin = require('gulp-htmlmin');
var jshint = require('gulp-jshint');
// mozilla 出品的模板引擎，类似于 Python jinjia2
var nunjucks = require('nunjucks');
var path = require('path');
var plumber = require('gulp-plumber');
// markdown parser
var Remarkable = require('remarkable');
var rename = require('gulp-rename');
var serveStatic = require('serve-static');
var source = require('vinyl-source-stream');
var sourcemaps = require('gulp-sourcemaps');
// stream 包装
var through = require('through2');
var uglify = require('gulp-uglify');

/**
 * The output directory for all the built files.
 */
const DEST = './build';

/**
 * The name of the Github repo.
 */
const REPO = 'solved-by-flexbox';


/**
 * Truthy if NODE_ENV isn't 'dev'
 * 见 npm "start": "NODE_ENV=dev gulp serve"
 * 不过在 windows 下需要这样：set NODE_ENV=dev && gulp serve 
 */
const PROD = process.env.NODE_ENV !== 'dev';

// http://mozilla.github.io/nunjucks/api.html#configure
nunjucks.configure('templates', { autoescape: false });

// plumber({errorHandler: streamError})
// ？
// Watch stops on errors
// https://github.com/gulpjs/gulp/issues/259
function streamError(err) {
  gutil.beep();
  gutil.log(err instanceof gutil.PluginError ? err.toString() : err.stack);
}


function extractFrontMatter(options) {
  var files = [];
  var site = assign({demos: []}, options);
  return through.obj(
    function transform(file, enc, done) {
      var contents = file.contents.toString();
      var yaml = frontMatter(contents);

      if (yaml.attributes) {
        var slug = path.basename(file.path, path.extname(file.path));

        file.contents = new Buffer(yaml.body);
        // 添加新属性
        file.data = {
          site: site,
          page: assign({slug: slug}, yaml.attributes)
        };

        if (file.path.indexOf('demos') > -1) {
          site.demos.push(file.data.page);
        }
      }

      files.push(file);
      done();
    },
    function flush(done) {
      files.forEach(function(file) { this.push(file); }.bind(this));
      done();
    }
  );
}


function renderMarkdown() {
  var markdown = new Remarkable({
    html: true,
    typographer: true,
    highlight: function (code, lang) {
      // Unescape to avoid double escaping.
      code = he.unescape(code);
      return lang ? hljs.highlight(lang, code).value : he.escape(code);
    }
  });
  return through.obj(function (file, enc, cb) {
    try {
      if (path.extname(file.path) == '.md') {
        file.contents = new Buffer(markdown.render(file.contents.toString()));
      }
      this.push(file);
    }
    catch (err) {
      this.emit('error', new gutil.PluginError('renderMarkdown', err, {
        fileName: file.path
      }));
    }
    cb();
  });
}


function renderTemplate() {
  // file 是 vinyl file
  // https://github.com/wearefractal/vinyl
  return through.obj(function (file, enc, cb) {
    try {
      // Render the file's content to the page.content template property.
      // 在 file.data 上添加 page.content，以便用在模板中
      var content = file.contents.toString();
      file.data.page.content = nunjucks.renderString(content, file.data);

      // Then render the page in its template.
      var template = file.data.page.template;
      file.contents = new Buffer(nunjucks.render(template, file.data));

      this.push(file);
    }
    catch (err) {
      this.emit('error', new gutil.PluginError('renderTemplate', err, {
        fileName: file.path
      }));
    }
    cb();
  });
}


gulp.task('pages', function() {

  var baseData = require('./config.json');
  var overrides = {
    baseUrl: PROD  ? '/' + REPO + '/' : '/',
    env: PROD ? 'prod' : 'dev'
  };
  var siteData = assign(baseData, overrides);

  return gulp.src(['*.html', './demos/**/*'], {base: process.cwd()})
      .pipe(plumber({errorHandler: streamError}))
      .pipe(extractFrontMatter(siteData))
      .pipe(renderMarkdown())
      .pipe(renderTemplate())
      .pipe(rename(function(path) {
        if (path.basename != 'index' && path.basename != '404') {
          path.dirname += '/' + path.basename;
          path.basename = 'index';
          path.extname = '.html';
        }
      }))
      .pipe(htmlmin({
        removeComments: true,
        collapseWhitespace: true,
        collapseBooleanAttributes: true,
        removeAttributeQuotes: true,
        removeRedundantAttributes: true,
        useShortDoctype: true,
        removeEmptyAttributes: true,
        minifyJS: true,
        minifyCSS: true
      }))
      .pipe(gulp.dest(DEST));
});


gulp.task('images', function() {
  return gulp.src('./assets/images/**/*')
      .pipe(gulp.dest(path.join(DEST, 'images')));
});


gulp.task('css', function() {
  return gulp.src('./assets/css/main.css')
      .pipe(plumber({errorHandler: streamError}))
      .pipe(cssnext({
        browsers: '> 1%, last 2 versions, Safari > 5, ie > 9, Firefox ESR',
        compress: true,
        url: false
      }))
      .pipe(gulp.dest(DEST));
});


gulp.task('lint', function() {
  return gulp.src('./assets/javascript/**/*.js')
      .pipe(plumber({errorHandler: streamError}))
      .pipe(jshint())
      .pipe(jshint.reporter('default'))
      .pipe(gulpIf(PROD, jshint.reporter('fail')));
});


gulp.task('javascript', ['lint'], function() {
  return browserify('./assets/javascript/main.js', {debug: true})
      .transform(babelify)
      .bundle()
      .on('error', streamError)
      .pipe(source('main.js'))
      .pipe(buffer())
      .pipe(sourcemaps.init({loadMaps: true}))
      .pipe(gulpIf(PROD, uglify()))
      .pipe(sourcemaps.write('./'))
      .pipe(gulp.dest(DEST));
});


gulp.task('clean', function(done) {
  del(DEST, done);
});


gulp.task('default', ['css', 'images', 'javascript', 'pages']);


gulp.task('serve', ['default'], function() {
  var port = argv.port || argv.p || 4000;
  connect().use(serveStatic(DEST)).listen(port);

  gulp.watch('./assets/css/**/*.css', ['css']);
  gulp.watch('./assets/images/*', ['images']);
  gulp.watch('./assets/javascript/*', ['javascript']);
  gulp.watch(['*.html', './demos/*', './templates/*'], ['pages']);
});


gulp.task('release', ['default'], function() {

  // Create a tempory directory and
  // checkout the existing gh-pages branch.
  rm('-rf', '_tmp');
  mkdir('_tmp');
  cd('_tmp');
  exec('git init');
  exec('git remote add origin git@github.com:philipwalton/' + REPO + '.git');
  exec('git pull origin gh-pages');

  // Delete all the existing files and add
  // the new ones from the build directory.
  rm('-rf', './*');
  cp('-rf', path.join('..', DEST, '/'), './');
  exec('git add -A');

  // Commit and push the changes to
  // the gh-pages branch.
  exec('git commit -m "Deploy site."');
  exec('git branch -m gh-pages');
  exec('git push origin gh-pages');

  // Clean up.
  cd('..');
  rm('-rf', '_tmp');
  rm('-rf', DEST);

});
