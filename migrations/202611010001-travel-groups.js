module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.sequelize.query(`CREATE TABLE [dbo].[TravelGroup] (
        [IdGroup] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [OwnerId] INT NOT NULL,
        [Name] NVARCHAR(60) COLLATE Latin1_General_100_CI_AS NOT NULL,
        CONSTRAINT [FK_TravelGroup_Owner] FOREIGN KEY ([OwnerId]) REFERENCES [dbo].[Users]([IdUser]),
        CONSTRAINT [UQ_TravelGroup_Owner_Name] UNIQUE ([OwnerId],[Name]),
        CONSTRAINT [CK_TravelGroup_Name] CHECK (LEN(LTRIM(RTRIM([Name]))) > 0)
      )`, { transaction });
      await queryInterface.sequelize.query(`CREATE TABLE [dbo].[TravelGroupMember] (
        [IdGroupMember] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [IdGroup] INT NOT NULL, [IdPerson] INT NOT NULL,
        CONSTRAINT [FK_TravelGroupMember_Group] FOREIGN KEY ([IdGroup]) REFERENCES [dbo].[TravelGroup]([IdGroup]),
        CONSTRAINT [FK_TravelGroupMember_Person] FOREIGN KEY ([IdPerson]) REFERENCES [dbo].[Person]([IdPerson]),
        CONSTRAINT [UQ_TravelGroupMember_Group_Person] UNIQUE ([IdGroup],[IdPerson])
      )`, { transaction });
      await queryInterface.sequelize.query('CREATE INDEX [IX_TravelGroupMember_Person] ON [dbo].[TravelGroupMember]([IdPerson])', { transaction });
    });
  },
  async down() { throw new Error('Reversión destructiva deshabilitada. Usa el respaldo previo en otra base.'); }
};
