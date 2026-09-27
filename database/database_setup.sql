CREATE DATABASE HabbitTracker;

USE HabbitTracker;

CREATE TABLE Users
(
    UserID INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL,
    Email NVARCHAR(255) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE()
);

CREATE TABLE Categories
(
    CategoryID INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE Habits
(
    HabitID INT IDENTITY(1,1) PRIMARY KEY,
    UserID INT NOT NULL,
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(500),
    CategoryID INT,
    TargetValue DECIMAL(10,2),
    Unit NVARCHAR(50),
    Frequency NVARCHAR(50) NOT NULL,
    Difficulty NVARCHAR(20),
    StartDate DATE NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),

    FOREIGN KEY (UserID) REFERENCES Users(UserID),
    FOREIGN KEY (CategoryID) REFERENCES Categories(CategoryID)
);

CREATE TABLE HabitLogs
(
    LogID INT IDENTITY(1,1) PRIMARY KEY,
    HabitID INT NOT NULL,
    Date DATE NOT NULL,
    Status NVARCHAR(30) NOT NULL,
    ActualValue DECIMAL(10,2),
    Notes NVARCHAR(500),
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),

    FOREIGN KEY (HabitID) REFERENCES Habits(HabitID)
);

CREATE TABLE Reflections
(
    ReflectionID INT IDENTITY(1,1) PRIMARY KEY,
    UserID INT NOT NULL,
    Date DATE NOT NULL,
    Mood NVARCHAR(30),
    Notes NVARCHAR(500),
    CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),

    FOREIGN KEY (UserID) REFERENCES Users(UserID)
);

SELECT * FROM Users;

SELECT UserID, Name, Email, PasswordHash, CreatedAt
FROM Users;

SELECT * FROM Habits;

SELECT *
FROM Habits
WHERE HabitID = 2;

SELECT *
FROM Habits;

SELECT HabitID, UserID, Name, TargetValue, Unit
FROM Habits;

SELECT *
FROM HabitLogs;

SELECT HabitID, UserID, Name, Description
FROM Habits
WHERE Name = 'Ownership Check';

SELECT HabitID, UserID, Name, TargetValue
FROM Habits
WHERE HabitID = 3;

SELECT HabitID, UserID, Name
FROM Habits
WHERE HabitID = 5;

SELECT HabitID, UserID, Name, TargetValue
FROM Habits
WHERE HabitID = 3;

SELECT LogID, HabitID, Date, Status, ActualValue, Notes
FROM HabitLogs
WHERE LogID = 3;

SELECT ReflectionID, UserID, Date, Mood, Notes
FROM Reflections
WHERE Notes = 'ownership test - reflections';

SELECT ReflectionID, UserID, Date, Mood, Notes
FROM Reflections;

SELECT ReflectionID, UserID, Date, Mood, Notes
FROM Reflections
WHERE ReflectionID = 2;

SELECT ReflectionID, UserID, Date, Mood, Notes
FROM Reflections;