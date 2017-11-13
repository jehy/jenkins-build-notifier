/* eslint-disable no-console */
const Jenkins = require('jenkins'),
  Promise = require('bluebird'),
  config = require('config'),
  jenkins = Jenkins(config.jenkins),
  SlackBot = require('slackbots'),
  moment = require('moment'),
  bunyan = require('bunyan'),
  log = bunyan.createLogger({name: 'Anna'}),
  bot = new SlackBot({token: config.slack.token, name: config.slack.name});

log.level(config.logger.level);

let slackUsers = [];
let monitoringBuilds = 0;

bot.on('start', () => {
  slackUsers = bot.getUsers()._value.members
    .filter((user) => {
      return user.profile.email !== undefined;
    })
    .map((user) => {
      return {name: user.name, email: user.profile.email};
    });
  // console.log.info(JSON.stringify(users, null, 3));
});

function randomInt(low, high) {
  return Math.floor(Math.random() * (high - low) + low);
}

function notifySlackUser(email, message, result) {
  const notifyUser = slackUsers.find((user) => {
    return user.email === email;
  });
  if (!notifyUser) {
    return;
  }
  let color = '#439FE0';
  if (result === 'SUCCESS') {
    color = 'good';
  }
  else if (result === 'FAILURE') {
    color = 'danger';
  }
  const richMessage = {
    attachments: [
      {
        fallback: message,
        color,
        /* pretext: 'Optional text that appears above the attachment block',
         author_name: 'Bobby Tables',
         author_link: 'http://flickr.com/bobby/',
         author_icon: 'http://flickr.com/icons/bobby.jpg',
         title: 'Slack API Documentation',
         title_link: 'https://api.slack.com/', */
        text: message,
        /* fields: [
          {
            title: 'Priority',
            value: 'High',
            short: false,
          },
        ],
        image_url: 'http://my-website.com/path/to/image.jpg',
        thumb_url: 'http://example.com/path/to/thumb.png',
        footer: 'Slack API',
        footer_icon: 'https://platform.slack-edge.com/img/default_application_icon.png',
        ts: 123456789, */
      },
    ],
    as_user: false,
    icon_url: 'http://www.topnews.ru/upload/img/f66c6758c3.jpg',
  };
  bot.postMessageToUser(notifyUser.name, '', richMessage)
    .then(() => log.debug(`${email} notified`))
    .catch((err) => {
      log.warn(`notifySlackUser: ${err}`);
    });
}

function monitorBuild(name, id) {
  Promise.delay(randomInt(config.jenkins.monitoring.build.delay.min, config.jenkins.monitoring.build.delay.max))
    .then(() => {
      return jenkins.build.get(name, id);
    })
    .then((build) => {
      // console.log.info(JSON.stringify(build, null, 3));
      if (build.result === null) {
        setImmediate(() => {
          monitorBuild(name, id);
        });
        return;
      }
      monitoringBuilds--;
      let userId = build.actions.find((action) => {
        return action.causes && action.causes[0] && action.causes[0].userId;
      });
      if (userId) {
        userId = userId.causes[0].userId;
        let message = `Build result for ${name} ${id}`;
        if (build.timestamp) {
          message += ` started on ${moment(build.timestamp).format('MM-DD HH:mm:ss')}`;
        }
        if (build.displayName) {
          message += ` for ${build.displayName}`;
        }
        message += ` is ${build.result}: ${build.url}console\nDuration: ${build.duration / 1000} sec`;
        log.debug(`${userId}: ${message}`);
        notifySlackUser(userId, message, build.result);
      }
    })
    .catch((err) => {
      if (err.code === 'ETIMEDOUT') {
        setImmediate(() => {
          monitorBuild(name, id);
        });
        log.info(`monitorBuild WARN: ${err}`);
        return;
      }
      log.error(`monitorBuild: ${err}`);
    });
}

function jobCheck(job) {
  // console.log.info(`checking job ${JSON.stringify(job)}`);
  Promise.delay(randomInt(config.jenkins.monitoring.job.delay.min, config.jenkins.monitoring.job.delay.max))
    .then(() => {
      return jenkins.job.get(job.name);
    })
    .then((jobData) => {
      if (jobData.lastBuild.number > job.last) {
        for (let i = job.last + 1; i <= jobData.lastBuild.number; i++) {
          monitoringBuilds++;
          monitorBuild(job.name, i);
        }
        job.last = jobData.lastBuild.number;
      }
      setImmediate(() => {
        jobCheck(job);
      });
    })
    .catch((err) => {
      if (err.code === 'ETIMEDOUT') {
        setImmediate(() => {
          jobCheck(job);
        });
        log.warn(`jobCheck: ${err}`);
        return;
      }
      log.error(`jobCheck ERR: ${err}`);
    });
}

function logMonitoring() {
  Promise.delay(10000)
    .then(() => {
      log.debug(`Monitoring builds: ${monitoringBuilds}`);
      setImmediate(logMonitoring);
    });
}

jenkins.job.list()
  .then((data) => {
    const jobNames = data.map(item => item.name).filter(item => item.indexOf('_OLD') === -1);
    logMonitoring();
    log.info(`Monitoring jobs: ${jobNames.join(', ')}`);
    return Promise.all(jobNames.map(name => jenkins.job.get(name)));
  })
  .then((jobsData) => {
    const currentJobs = jobsData.map((jobData) => {
      return {name: jobData.name, last: jobData.lastBuild.number, description: jobData.description};
    });
    currentJobs.forEach(job => jobCheck(job));
  })
  .catch((err) => {
    log.error(`job.list: ${err}`);
  });
