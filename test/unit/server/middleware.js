import proxyquire from 'proxyquire';
import { GraphQLSchema, GraphQLObjectType, GraphQLString } from 'graphql';
import Parse from 'parse/node';

let setup;
const sessionToken = 'session-token';
const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      f1: {
        type: GraphQLString,
        resolve: () => 'hello',
      },
    },
  }),
});

describe('Express middleware', () => {
  let graphqlHTTPSpy;
  let queryEqualToSpy;
  let queryFirstStub;
  let createQuerySpy;

  beforeEach(() => {
    graphqlHTTPSpy = spy();
    queryEqualToSpy = spy();
    createQuerySpy = spy();

    setup = proxyquire('../../../src/server/middleware', {
      'express-graphql': (callback) => {
        graphqlHTTPSpy(callback);
        return callback;
      },

      './lib/query': {
        create(token) {
          createQuerySpy(token);
          return 'authorized query';
        },
      },
    }).setup;

    queryEqualToSpy = spy(Parse.Query.prototype, 'equalTo');
    queryFirstStub = stub(Parse.Query.prototype, 'first', () => Promise.resolve({}));
  });

  afterEach(() => {

  });

  it('exports setup function', () => {
    expect(setup).to.be.ok;
    expect(typeof setup).to.equal('function');
  });

  describe('setup', () => {
    it('requires a valid schema object', () => {
      function setupWithoutArgs() { setup(); }
      function setupWithWrongSchema() { setup({ schema: 'hello' }); }

      expect(setupWithoutArgs).to.throw(Error);
      expect(setupWithWrongSchema).to.throw(Error);
    });

    it('calls graphqlHTTP middleware and returns a function', () => {
      setup({ schema });
      expect(graphqlHTTPSpy).to.have.been.calledOnce;
    });
  });

  describe('middleware function', () => {
    it('returns basic options if request has no authorization header', () => {
      const graphiql = true;
      const cb = setup({ schema, graphiql });
      const r = cb({});

      expect(r.schema).to.equal(schema);
      expect(r.graphiql).to.equal(graphiql);
      expect(r.context.Query).to.equal(Parse.Query);
    });
  });

  it('looks for a session based on session token in authorization header', () => {
    const graphiql = true;
    const cb = setup({ schema, graphiql });
    cb({
      headers: {
        authorization: sessionToken,
      },
    });

    expect(queryEqualToSpy).to.have.been.calledOnce;
    expect(queryEqualToSpy).to.have.been.calledWith('sessionToken', sessionToken);
    expect(queryFirstStub).to.have.been.calledOnce;
    expect(queryFirstStub).to.have.been.calledWith({ useMasterKey: true });
  });

  it('throws if session token lookup fails', (done) => {
    Parse.Query.prototype.first.restore();
    queryFirstStub = stub(Parse.Query.prototype, 'first', () => Promise.reject({}));

    const cb = setup({ schema });
    const r = cb({
      headers: {
        authorization: sessionToken,
      },
    });

    r.then(() => {}, () => done());
  });

  it('returns extended context if token lookup succeeds + uses patched query generator', (done) => {
    Parse.Query.prototype.first.restore();
    queryFirstStub = stub(Parse.Query.prototype, 'first', () => Promise.resolve({}));

    const cb = setup({ schema });
    const r = cb({
      headers: {
        authorization: sessionToken,
      },
    });

    r.then((options) => {
      expect(createQuerySpy).to.have.been.calledOnce;
      expect(createQuerySpy).to.have.been.calledWith(sessionToken);
      expect(options.context.Query).to.equal('authorized query');
      expect(options.context.sessionToken).to.equal(sessionToken);
      done();
    });
  });
});
