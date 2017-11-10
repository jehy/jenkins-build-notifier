# jenkins build notifier

[![Build Status](https://travis-ci.org/jehy/jenkins-build-notifier.svg?branch=master)](https://travis-ci.org/jehy/jenkins-build-notifier)
[![dependencies Status](https://david-dm.org/jehy/jenkins-build-notifier/status.svg)](https://david-dm.org/jehy/jenkins-build-notifier)
[![devDependencies Status](https://david-dm.org/jehy/jenkins-build-notifier/dev-status.svg)](https://david-dm.org/jehy/jenkins-build-notifier?type=dev)

Notifies users about their completed builds in jenkins.


## Usage
**config.json**
```json
{
  "jenkins": {
    "baseUrl": "https://user@domain:token@host",
    "crumbIssuer": true,
    "promisify": true
  },
  "slack": {
    "token": "secret",
    "name": "Vasya"
  }
}
```
## Config parameters
* `jenkins` - data for connection to jenkins
* `slack` - data for connection to slack