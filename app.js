'use strict';

const Jenkins = require('jenkins');
const Promise = require('bluebird');
const config = require('config');
const SlackBot = require('slackbots');
const moment = require('moment');
const bunyan = require('bunyan');

const log = bunyan.createLogger({name: 'Anna'});
const jenkins = Jenkins(config.jenkins);
const bot = new SlackBot({token: config.slack.token, name: config.slack.name});

log.level(config.logger.level);

let slackUsers = [];
let monitoringBuilds = 0;

function updateUsersBase() {
  slackUsers = bot.getUsers()._value.members
    .filter((user) => {
      return user.profile.email !== undefined;
    })
    .map((user) => {
      return {name: user.name, email: user.profile.email};
    });
  log.debug(`Users data updated: ${slackUsers.length} users`);
  setTimeout(updateUsersBase, 1000 * 60 * 60);
}

bot.on('start', () => {
  updateUsersBase();
});

function randomInt(low, high) {
  return Math.floor(Math.random() * (high - low) + low);
}

async function notifySlackUser(email, message, result) {
  const notifyUser = slackUsers.find((user) => {
    return user.email === email;
  });
  if (!notifyUser) {
    return false;
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
  return bot.postMessageToUser(notifyUser.name, '', richMessage)
    .then(() => log.debug(`${email} notified`))
    .catch((err) => {
      log.warn(`notifySlackUser: ${err}`);
    });
}

async function monitorBuild(name, id) {
  await Promise.delay(randomInt(config.jenkins.monitoring.build.delay.min, config.jenkins.monitoring.build.delay.max));
  try {
    const build = await Promise.resolve(jenkins.build.get(name, id)).timeout(20000);
    log.debug(`checking build ${id} for ${name}`);
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
        message += ` started on ${moment(build.timestamp)
          .format('MM-DD HH:mm:ss')}`;
      }
      if (build.displayName) {
        message += ` for ${build.displayName}`;
      }
      message += ` is ${build.result}: ${build.url}console\nDuration: ${build.duration / 1000} sec`;
      log.debug(`${userId}: ${message}`);
      notifySlackUser(userId, message, build.result);
    }
  }
  catch (err) {
    if (err.code === 'ETIMEDOUT' || err.name === 'TimeoutError') {
      setImmediate(() => {
        monitorBuild(name, id);
      });
      log.info(`monitorBuild WARN: ${err}`);
      return;
    }
    log.error(`monitorBuild: ${err}`);
  }
}

async function jobCheck(job) {
  // console.log.info(`checking job ${JSON.stringify(job)}`);
  await Promise.delay(randomInt(config.jenkins.monitoring.job.delay.min, config.jenkins.monitoring.job.delay.max));
  try {
    const jobData = await Promise.resolve(jenkins.job.get(job.name)).timeout(20000);
    if (!jobData.lastBuild)
    {
      log.trace(`checking job ${job.name}: no build data, skiping`);
      return;
    }
    log.trace(`checking job ${job.name}: build ${jobData.lastBuild.number} vs last ${job.last}`);
    if (jobData.lastBuild.number > job.last) {
      for (let i = job.last + 1; i <= jobData.lastBuild.number; i++) {
        log.debug(`Adding build ${i} for ${job.name} to monitor`);
        monitoringBuilds++;
        monitorBuild(job.name, i);
      }
      job.last = jobData.lastBuild.number;
    }
    setImmediate(() => {
      jobCheck(job);
    });
  } catch (err) {
    if (err.code === 'ETIMEDOUT' || err.name === 'TimeoutError') {
      setImmediate(() => {
        jobCheck(job);
      });
      log.warn(`jobCheck: ${err}`);
      return;
    }
    log.error(`jobCheck ERR: ${err}`);
  }
}

function logMonitoring() {
  log.debug(`Monitoring builds: ${monitoringBuilds}`);
  setTimeout(logMonitoring, 10000);
}

async function run() {
  try {
    const data = await Promise.resolve(jenkins.job.list()).timeout(20000);
    const jobNames = data.map(item => item.name)
      .filter(item => item.indexOf('_OLD') === -1);
    setTimeout(logMonitoring, 10000);
    log.info(`Monitoring jobs: ${jobNames.join(', ')}`);
    const jobsData = await Promise.map(jobNames, name => jenkins.job.get(name), {concurrency: 3});
    const currentJobs = jobsData.map((jobData) => {
      return {
        name: jobData.name,
        last: jobData.lastBuild && jobData.lastBuild.number,
        description: jobData.description,
      };
    });
    currentJobs.forEach(job => jobCheck(job));
  }
  catch (err) {
    log.error(`job.list: ${err}`);
  }
}

run();
