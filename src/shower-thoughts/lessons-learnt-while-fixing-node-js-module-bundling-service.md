---
title: Lessons learnt while fixing node.js based dynamic module bundling service
date: 2019-02-06
keywords: javascript, promise, nodejs, node.js, macrotask, microtask, blockage
---

A few month ago we made service to allow bundling client side modules on demand. The service takes a series of module paths from querystring, then the service pulls the source code, calls bundling tool such as r.js to merge them into one .js file and http response it back to client side.

![inside node js event loop](/resources/lessons-learnt-event-loop/event-loop.jpg)

The reason we need this service is because our marketing team uses something similar to wix or squarespace which allows marketing people to change the webpage the way they wanted. For example they are allowed to not only change the copies on the webpage but also allowed to rearrange the 'components' and even test and target partial of the page.

As a result each web page ends up with different combination of 'components' and there is no way to determine what component will be used by which page at the time of building the project, its totally at the marketing personel's hand.

So what we planned to do is to use the client side AMD module system to collect the 'needs' at certain webpage life cycle, such as `ondomready`, then send out the 'needs' to above mentioned bundling service to get a tailored bundle made specifically to that page. 

At the beginning this service just works fine, it is behind the CDN and has its own cache layer, so it only takes a while to warm up and then most of the time the requests from client side are done in a blink of eyes. 

However a few weeks later we release new version of the 'components', which forces the service to pull the source code and redo the initial warm up bundling again. Large amount of traffic goes there and put it under heavy load.

Then what happened was the k8s pod that hosts the service got killed because of readiness probe failed to probe it, and it lost all the cache that previous had made and made the situation even worse because the service now need to regenerate the cache and that put it into even higher CPU usage.

The service never come back no matter how long you wait and it simply be killed by k8s again and again.

As a result we make our webpage fallback to static bundle, which is usually 2 times larger than tailored version.

A few days ago I finally got some time to look back at this issue. I have to say I learnt a lot about node js from this issue, it turns out the main causes of this are:

1. Readiness probe failed so the pod gets killed, and the causes of readiness probe problem are:
    1. CPU usage too high (not the main reason) 
    1. App code was done in a blocking manner (main reason)
1. CPU usage too high so the pod gets killed (not the main reason)
1. Because the pod gets kill it never get the chance to build up cache so as result it keeps the high cpu usage

I didn't really expect point 1.2 to happen for a node js app, node js is built to be able to handle large amount of concurrent traffic. 

The first thing we check is the tool we use. The bundling tool r.js, it is not designed to be used in web service to handle multiple concurrent traffic, but at its worst, it takes 3 seconds to bundles all the files. And 3 seconds blockage shouldn't cause the service to be completed blocked. In theory there should be some gap to allow the network i/o to catch up the breath between the bundlings.

So after trying reproduce it in a smaller scale and checking the logs something interesting turns up:

```log
...
vWrpWB9rvfhBNgF591SeB7 2019-02-05T11:24:52.373Z: Source has pulled
c8AZnNFYNiWHy8QA6G1QzF 2019-02-05T11:24:52.374Z: Source has pulled
heG6zRQgBLWD6oKEBjZBdc 2019-02-05T11:24:52.374Z: Source has pulled
mwZRyiJaVhAMf18jkPyAmj 2019-02-05T11:24:52.374Z: Source has pulled
4iyUwREJk5AGBKSJbRFbh7 2019-02-05T11:24:52.374Z: Source has pulled
...
vWrpWB9rvfhBNgF591SeB7 2019-02-05T11:24:52.376Z: Start r.js bundling...
vWrpWB9rvfhBNgF591SeB7 2019-02-05T11:24:53.908Z: R.js is done
vWrpWB9rvfhBNgF591SeB7 2019-02-05T11:24:53.908Z: Updating source map path...
c8AZnNFYNiWHy8QA6G1QzF 2019-02-05T11:24:53.909Z: Start r.js bundling...
c8AZnNFYNiWHy8QA6G1QzF 2019-02-05T11:24:55.048Z: R.js is done
c8AZnNFYNiWHy8QA6G1QzF 2019-02-05T11:24:55.048Z: Updating source map path...
heG6zRQgBLWD6oKEBjZBdc 2019-02-05T11:24:55.049Z: Start r.js bundling...
heG6zRQgBLWD6oKEBjZBdc 2019-02-05T11:24:55.886Z: R.js is done
heG6zRQgBLWD6oKEBjZBdc 2019-02-05T11:24:55.886Z: Updating source map path...
mwZRyiJaVhAMf18jkPyAmj 2019-02-05T11:24:55.886Z: Start r.js bundling...
mwZRyiJaVhAMf18jkPyAmj 2019-02-05T11:24:56.661Z: R.js is done
mwZRyiJaVhAMf18jkPyAmj 2019-02-05T11:24:56.661Z: Updating source map path...
4iyUwREJk5AGBKSJbRFbh7 2019-02-05T11:24:56.662Z: Start r.js bundling...
4iyUwREJk5AGBKSJbRFbh7 2019-02-05T11:24:57.289Z: R.js is done
4iyUwREJk5AGBKSJbRFbh7 2019-02-05T11:24:57.290Z: Updating source map path...
kL7kLS2A3GLqEeZymgJu8h 2019-02-05T11:24:57.290Z: Start r.js bundling...
kL7kLS2A3GLqEeZymgJu8h 2019-02-05T11:24:58.148Z: R.js is done
...
c8AZnNFYNiWHy8QA6G1QzF 2019-02-05T11:25:07.587Z: Code delivered
mwZRyiJaVhAMf18jkPyAmj 2019-02-05T11:25:07.592Z: Code delivered
heG6zRQgBLWD6oKEBjZBdc 2019-02-05T11:25:07.594Z: Code delivered
vWrpWB9rvfhBNgF591SeB7 2019-02-05T11:25:07.594Z: Code delivered
4iyUwREJk5AGBKSJbRFbh7 2019-02-05T11:25:07.595Z: Code delivered
...
```

There are 2 things worth looking at here, the first is from "start r.js bundling" to "R.js is done" they always run in series. This is very apparently due to r.js is not design to be used in web service and it is blocking the main thread as mentioned above, this can be easily fixed by fork new process for bundling and it fixes all the issues we have.

But what really interested me is, even though r.js is blocking, between "r.js is done" and next "Start r.js bundling", in theory, there should be some gap for the I/O to pick up so the quick health check request can squeeze into somewhere between the bundling, but it never happens, in fact, when I deliberately send a health check request, after first bundling starts, the health check only gets respond after all the bundling tasks are done.

So what makes event driven node js to be completely blocked for so long.

After reading <https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick/> try to make sense the node js event loop, and reading our source code I finally realise there is a mistake in our code.

Here is roughly how the code generates log:

```javascript
pullSource(context)
    .then(function(){
        return new Promise(function(resolve, reject){
            logger.verbose(`Start r.js bundling...`);
            requireJS.optimize(amdConfig, 
                function(){
                    logger.verbose(`R.js is done`);
                    resolve(result);
                }, 
                reject);    
        });
    })
    .then(function(result){
        logger.verbose(`Updating source map path...`);
        ...
    })
    .then(resolve, reject)
```

It turns out to be an optimisation I did in the `pullSource()` caused all the blockage here. 

For bunding the modules, obviously the first task is to pull the module source code. however if someone already pulled or is started pulling the resource, the following request do not need to pull it again, all they need to do is wait the first request finish the pulling and then go ahead to bundle the files.

So we have a global `promise` variable that will be resolved when first source pulling is finished, and all up coming request will be registered to that promise. So they get signaled when it is ready to do bundling.

Rough representation of the logic

```
var promiseOfPulling;

function pullSource() {
    if (promiseOfPulling) {
        return promiseOfPulling
    }
    ...
}

```

A quick explanation to the problem here is, when that global promise resolves, it triggers all the `then` callbacks, and because promise triggers the `then` callbacks by using a `microtask`, which is something similar to `nextTick`. All the upcoming `then` callbacks are executed immediately after current pullSource is finished, one after the other without allowing the event loop to advance to next iteration. 

According to above linked node js event loop guide, `nextTick` executes the callback immediately after current c++ to Javascript `operation` finishes. While `setImmediate` executes the callback in the next event loop iteration.

And they say: "In essence, the names should be swapped. `process.nextTick()` fires more immediately than `setImmediate()`, but this is an artifact of the past which is unlikely to change. Making this switch would break a large percentage of the packages on npm"

Below diagram is copied from the node js event loop guide.

```
   ┌───────────────────────────┐
┌─>│           timers          │
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │     pending callbacks     │
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │       idle, prepare       │
│  └─────────────┬─────────────┘      ┌───────────────┐
│  ┌─────────────┴─────────────┐      │   incoming:   │
│  │           poll            │<─────┤  connections, │
│  └─────────────┬─────────────┘      │   data, etc.  │
│  ┌─────────────┴─────────────┐      └───────────────┘
│  │           check           │
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
└──┤      close callbacks      │
   └───────────────────────────┘
```

Basic the `poll` phase is the phase for handling most of the IO callbacks, without allowing poll phase to be executed the request will not be responded. our `pullSource` was executed in `poll` phase, and it spawn a bunch of cpu intensive tasks within the poll phase itself which blocks the event loop going any further.

There was a `process.maxTickDepth` in node js, that prevents too many next ticks so the I/O is blocked, but for some reason they removed it from node js.

So, the fix is to use `setImmediate()` between the `pullSource()` and bundling task. The question is where to put it.

I tried to simply put a `setImmediate()` right after `pullSource()`:

```
pullSource(context)
    .then(function(){
        return new Promise(rs => {
            setImmediate(rs)        
        })
    })
    .then(() => {
        ... doing bundling
    })

```

This does not solve the issue, what it does is simply schedule all the bundling tasks into next iteration of event loop, and then blocks it there again

After scratching my head for a while, it turns out the simply solution is to change the bit where the problem was created, inside `pullSource` the global promise should be handled this way:

```
var promiseOfPulling;

function pullSource() {
    if (promiseOfPulling) {
        promiseOfPulling = promiseOfPulling
            .then(function(){
                return new Promise(rs => {
                    setImmediate(rs)
                })
            })
    }
    ...
}
```

This way it makes sure between the bundling tasks, there will always be a iteration of event loop, so the I/O can be handled there in the new `poll` phase.

And here is the logs after the improvement

```
e9VLLPWvi8XS5xKQFNjNk1 2019-02-07T10:48:57.530Z: Source has pulled
keDxfzv4hwKp8yw3CXRAFi 2019-02-07T10:48:57.530Z: Source has pulled
e9VLLPWvi8XS5xKQFNjNk1 2019-02-07T10:48:57.531Z: Start r.js bundling...
e9VLLPWvi8XS5xKQFNjNk1 2019-02-07T10:49:04.971Z: R.js is done
e9VLLPWvi8XS5xKQFNjNk1 2019-02-07T10:49:04.972Z: Updating source map path...
keDxfzv4hwKp8yw3CXRAFi 2019-02-07T10:49:04.973Z: Start r.js bundling...
keDxfzv4hwKp8yw3CXRAFi 2019-02-07T10:49:11.335Z: R.js is done
keDxfzv4hwKp8yw3CXRAFi 2019-02-07T10:49:11.335Z: Updating source map path...
oFSyi27wpciHjE94gFvLpv 2019-02-07T10:49:11.337Z: Source has pulled
oFSyi27wpciHjE94gFvLpv 2019-02-07T10:49:11.338Z: Start r.js bundling...
oFSyi27wpciHjE94gFvLpv 2019-02-07T10:49:17.576Z: R.js is done
oFSyi27wpciHjE94gFvLpv 2019-02-07T10:49:17.576Z: Updating source map path...
a1FHmsDvXdDc7gfRrBcQ2k 2019-02-07T10:49:17.578Z: Source has pulled
a1FHmsDvXdDc7gfRrBcQ2k 2019-02-07T10:49:17.579Z: Start r.js bundling...
a1FHmsDvXdDc7gfRrBcQ2k 2019-02-07T10:49:23.752Z: R.js is done
a1FHmsDvXdDc7gfRrBcQ2k 2019-02-07T10:49:23.753Z: Updating source map path...
tXj2JJ7z3RjazmarSBqTXP 2019-02-07T10:49:23.755Z: requested for non-existing path: /
tXj2JJ7z3RjazmarSBqTXP 2019-02-07T10:49:23.756Z:    with query: null
fexqDsSssQLG8cATUts9TH 2019-02-07T10:49:23.760Z: Source has pulled
fexqDsSssQLG8cATUts9TH 2019-02-07T10:49:23.761Z: Start r.js bundling...
fexqDsSssQLG8cATUts9TH 2019-02-07T10:49:29.349Z: R.js is done
fexqDsSssQLG8cATUts9TH 2019-02-07T10:49:29.350Z: Updating source map path...
mMg99u4KbwBvAjxeTvQd5q 2019-02-07T10:49:29.352Z: Source has pulled
mMg99u4KbwBvAjxeTvQd5q 2019-02-07T10:49:29.395Z: Start r.js bundling...
mMg99u4KbwBvAjxeTvQd5q 2019-02-07T10:49:35.082Z: R.js is done
mMg99u4KbwBvAjxeTvQd5q 2019-02-07T10:49:35.082Z: Updating source map path...
vpDw5NYK7PzQw6oT33L4sg 2019-02-07T10:49:35.085Z: Source has pulled
vpDw5NYK7PzQw6oT33L4sg 2019-02-07T10:49:35.139Z: Start r.js bundling...
vpDw5NYK7PzQw6oT33L4sg 2019-02-07T10:49:40.915Z: R.js is done
vpDw5NYK7PzQw6oT33L4sg 2019-02-07T10:49:40.916Z: Updating source map path...
oB112914nD19yd6eSCbJLP 2019-02-07T10:49:40.918Z: requested for non-existing path: /
oB112914nD19yd6eSCbJLP 2019-02-07T10:49:40.918Z:    with query: null
5SrdVUQhQ8bPnSNbEGxJTJ 2019-02-07T10:49:40.919Z: Source has pulled
5SrdVUQhQ8bPnSNbEGxJTJ 2019-02-07T10:49:40.959Z: Start r.js bundling...
5SrdVUQhQ8bPnSNbEGxJTJ 2019-02-07T10:49:46.589Z: R.js is done
5SrdVUQhQ8bPnSNbEGxJTJ 2019-02-07T10:49:46.589Z: Updating source map path...
jzEH3v6M3TjnjoatJZgh4s 2019-02-07T10:49:46.590Z: Source has pulled
jzEH3v6M3TjnjoatJZgh4s 2019-02-07T10:49:46.616Z: Start r.js bundling...
jzEH3v6M3TjnjoatJZgh4s 2019-02-07T10:49:51.902Z: R.js is done
jzEH3v6M3TjnjoatJZgh4s 2019-02-07T10:49:51.902Z: Updating source map path...
wmbPj8kvoHg7WBvmixhzcA 2019-02-07T10:49:51.904Z: Source has pulled
wmbPj8kvoHg7WBvmixhzcA 2019-02-07T10:49:51.930Z: Start r.js bundling...
wmbPj8kvoHg7WBvmixhzcA 2019-02-07T10:49:57.038Z: R.js is done
wmbPj8kvoHg7WBvmixhzcA 2019-02-07T10:49:57.038Z: Updating source map path...
nAVS9MyvbLQpWghXsVtdCZ 2019-02-07T10:49:57.039Z: Source has pulled
e9VLLPWvi8XS5xKQFNjNk1 2019-02-07T10:49:57.039Z: Code delivered
keDxfzv4hwKp8yw3CXRAFi 2019-02-07T10:49:57.043Z: Code delivered
nAVS9MyvbLQpWghXsVtdCZ 2019-02-07T10:49:57.072Z: Start r.js bundling...
nAVS9MyvbLQpWghXsVtdCZ 2019-02-07T10:50:02.338Z: R.js is done
nAVS9MyvbLQpWghXsVtdCZ 2019-02-07T10:50:02.338Z: Updating source map path...
fjqUXbACv68cNABeyWNA2N 2019-02-07T10:50:02.341Z: Source has pulled
oFSyi27wpciHjE94gFvLpv 2019-02-07T10:50:02.341Z: Code delivered
```

Much better, as you see from above, the health checks get squeezed into between the bundlings. 

To make faster service and solve the issue properly, there are a few other improvement that need to be done here, such as forking the bundling and return static bundle when dynamic bundle is not ready to client side. But for now this is great lesson learnt about node js event loop: Be careful about centralised waiting in node js app.
