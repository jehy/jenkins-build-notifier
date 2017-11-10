/* eslint-disable no-console */
const Jenkins = require('jenkins'),
  Promise = require('bluebird'),
  config = require('./config/default.json'),
  jenkins = Jenkins(config.jenkins),
  SlackBot = require('slackbots'),
  bot = new SlackBot({token: config.slack.token, name: config.slack.name});

let slackUsers = [];

bot.on('start', () => {
  slackUsers = bot.getUsers()._value.members
    .filter((user) => {
      return user.profile.email !== undefined;
    })
    .map((user) => {
      return {name: user.name, email: user.profile.email};
    });
  // console.log(JSON.stringify(users, null, 3));
});

function randomInt(low, high) {
  return Math.floor(Math.random() * (high - low) + low);
}

function notifySlackUser(email, message) {
  const notifyUser = slackUsers.find((user) => {
    return user.email === email;
  });
  if (!notifyUser) {
    return;
  }
  bot.postMessageToUser(notifyUser.name, message, {
    as_user: false,
    icon_url: 'http://www.topnews.ru/upload/img/f66c6758c3.jpg',
  })
    .then(() => console.log(`${email} notified`))
    .catch((err) => {
      console.log(`ERR notifySlackUser: ${err}`);
    });
}

function monitorBuild(name, id) {
  Promise.delay(randomInt(1000, 10000))
    .then(() => {
      return jenkins.build.get(name, id);
    })
    .then((build) => {
      // console.log(JSON.stringify(build, null, 3));
      if (build.result === null) {
        setImmediate(() => {
          monitorBuild(name, id);
        });
        return;
      }
      let userId = build.actions.find((action) => {
        return action.causes && action.causes[0] && action.causes[0].userId;
      });
      if (userId) {
        userId = userId.causes[0].userId;
        const message = `Build result for ${name} ${id} is ${build.result}: ${build.url}console`;
        console.log(`${userId}: ${message}`);
        notifySlackUser(userId, message);
      }
    })
    .catch((err) => {
      console.log(`monitorBuild ERR: ${err}`);
    });
}

function jobCheck(job) {
  // console.log(`checking job ${JSON.stringify(job)}`);
  Promise.delay(randomInt(100, 10000))
    .then(() => {
      return jenkins.job.get(job.name);
    })
    .then((jobData) => {
      if (jobData.lastBuild.number > job.last) {
        for (let i = job.last + 1; i <= jobData.lastBuild.number; i++) {
          monitorBuild(job.name, i);
        }
        job.last = jobData.lastBuild.number;
      }
      setImmediate(() => {
        jobCheck(job);
      });
    })
    .catch((err) => {
      console.log(`jobCheck ERR: ${err}`);
    });
}

jenkins.job.list()
  .then((data) => {
    const jobNames = data.map(item => item.name).filter(item => item.indexOf('_OLD') === -1);
    console.log('Monitoring jobs:', jobNames.join(', '));
    return Promise.all(jobNames.map(name => jenkins.job.get(name)));
  })
  .then((jobsData) => {
    const currentJobs = jobsData.map((jobData) => {
      return {name: jobData.name, last: jobData.lastBuild.number, description: jobData.description};
    });
    currentJobs.forEach(job => jobCheck(job));
  })
  .catch((err) => {
    console.log(`job.list ERR: ${err}`);
  });
