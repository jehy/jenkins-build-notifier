# jenkins build notifier

[![Build Status](https://travis-ci.org/jehy/jenkins-build-notifier.svg?branch=master)](https://travis-ci.org/jehy/jenkins-build-notifier)
[![dependencies Status](https://david-dm.org/jehy/jenkins-build-notifier/status.svg)](https://david-dm.org/jehy/jenkins-build-notifier)
[![devDependencies Status](https://david-dm.org/jehy/jenkins-build-notifier/dev-status.svg)](https://david-dm.org/jehy/jenkins-build-notifier?type=dev)

Notifies slack users about their completed builds in jenkins (user email should be same in slack and jenkins).


## Usage

### Setup
**runtime.json**
```json
{
  "jenkins": {
    "baseUrl": "https://user@domain:token@host"
  },
  "slack": {
    "token": "secret",
    "name": "Vasya"
  }
}
```
### Run

```bash
npm start
```
or with cute colored logs:

```bash
npm run start-local
```